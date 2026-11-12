//! Mock NEP-141 token for testnet (USDC / NVDAx stand-ins). NOT a production token.
//! - `ft_transfer` / `ft_transfer_call` require exactly 1 yoctoNEAR (F-013).
//! - `ft_transfer_call` calls `receiver.ft_on_transfer(sender_id, amount, msg)` and refunds the
//!   unused amount it returns in `ft_resolve_transfer` (F-013).
//! - SR-27: `storage_deposit` charges the measured storage cost and refunds the excess (owner exempt: scripts register
//!   demo accounts and the owner tops up the token account). Accounts auto-register on first receipt only up to
//!   `MAX_FREE_REGISTRATIONS`, so free entries cannot exhaust the token account's stake; after that receivers register.
//! - `mint` is owner-only.
//! - v7 (interface-v7.md A3): `multiplier()` (default 1e18) + owner `update_multiplier`, stored under a raw
//!   storage key so the live mock accounts take a code-only upgrade (root struct unchanged).
//! - v7 (A4 tests): owner `set_registration_required(true)` makes transfers to an account that never
//!   registered (`storage_deposit`, mint or a prior receipt) fail like a real NEP-145 token. Default off.
//! - WO-61: capped public `faucet_mint` (owner `set_faucet`; disabled until set). Config under a raw key, claims in a
//!   LookupMap with its own prefix, so the live mocks take a code-only upgrade. The caller pays the measured storage of
//!   the records the claim adds (balance entry if new, claim record on first claim) and gets the rest back. Emits the
//!   NEP-141 `ft_mint` event (NEPs @095fe98 nep-0141.md:342-367, NEP-297 F-021).

use near_sdk::json_types::{U64, U128};
use near_sdk::serde_json::json;
use near_sdk::store::LookupMap;
use near_sdk::{
    AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue, assert_one_yocto, env, near,
    require,
};

const GAS_FOR_RESOLVE: Gas = Gas::from_tgas(10);
const GAS_FOR_FT_TRANSFER_CALL: Gas = Gas::from_tgas(50);
/// Reported by `storage_balance_of` / `storage_deposit`.
const STORAGE_BOUND_YOCTO: u128 = 1_250_000_000_000_000_000_000;
/// Raw keys outside the root struct (no migrate on the live mocks).
const MULTIPLIER_KEY: &[u8] = b"__multiplier_e18";
const REGISTRATION_REQUIRED_KEY: &[u8] = b"__registration_required";
/// SR-27: count of accounts registered for free on first receipt. The cap stays under the ~95 entries the live token
/// accounts can stake.
const FREE_REGISTRATIONS_KEY: &[u8] = b"__free_registrations";
const MAX_FREE_REGISTRATIONS: u32 = 64;
const E18: u128 = 1_000_000_000_000_000_000;
/// WO-61: borsh `FaucetConfig` under a raw key; absent = disabled.
const FAUCET_CONFIG_KEY: &[u8] = b"__faucet_config";
/// Storage accounting per record: key + value + 40 bytes (near-parameters 0.38.0 parameters.yaml:37
/// `storage_num_extra_bytes_record: 40`). Used only by the `faucet_status` prediction; `faucet_mint` measures.
const RECORD_OVERHEAD_BYTES: u64 = 40;
/// borsh(u128) balance value and borsh(FaucetClaim) = u128 + u64.
const BALANCE_VALUE_BYTES: u64 = 16;
const CLAIM_VALUE_BYTES: u64 = 24;
const NS_PER_S: u64 = 1_000_000_000;

/// Storage prefixes: `Balances` = [0] (live layout), `FaucetClaims` = [1] (WO-61, not in the root struct). Raw keys
/// start with `__`, the root with `STATE`, so [1] collides with nothing.
#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum StorageKey {
    Balances,
    FaucetClaims,
}

#[near(serializers = [borsh])]
#[derive(Clone, Copy, Default)]
struct FaucetConfig {
    enabled: bool,
    amount_per_claim: u128,
    cap_per_account: u128,
    cooldown_s: u64,
}

#[near(serializers = [borsh])]
#[derive(Clone, Copy)]
struct FaucetClaim {
    claimed: u128,
    last_claim_ns: u64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FaucetConfigView {
    pub enabled: bool,
    pub amount_per_claim: U128,
    pub cap_per_account: U128,
    pub cooldown_s: u64,
}

/// `next_claim_at_ns` is a string (U64): ns timestamps exceed JS safe integers. 0 = never claimed.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FaucetStatus {
    pub claimed: U128,
    pub next_claim_at_ns: U64,
    pub can_claim: bool,
    pub storage_cost_yocto: U128,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FtMetadata {
    pub spec: String,
    pub name: String,
    pub symbol: String,
    pub icon: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<String>,
    pub decimals: u8,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StorageBalance {
    pub total: U128,
    pub available: U128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct MockFt {
    owner: AccountId,
    name: String,
    symbol: String,
    decimals: u8,
    total_supply: u128,
    balances: LookupMap<AccountId, u128>,
}

impl MockFt {
    fn balance(&self, a: &AccountId) -> u128 {
        self.balances.get(a).copied().unwrap_or(0)
    }
    fn internal_transfer(&mut self, from: &AccountId, to: &AccountId, amount: u128) {
        require!(from != to, "sender and receiver must differ");
        require!(amount > 0, "amount must be > 0");
        if !self.balances.contains_key(to) {
            let used = self.free_registrations();
            require!(!self.registration_required() && used < MAX_FREE_REGISTRATIONS, "receiver not registered");
            env::storage_write(FREE_REGISTRATIONS_KEY, &(used + 1).to_le_bytes());
        }
        let fb = self.balance(from);
        let nf = fb.checked_sub(amount).unwrap_or_else(|| env::panic_str("insufficient balance"));
        let nt = self.balance(to).checked_add(amount).unwrap_or_else(|| env::panic_str("balance overflow"));
        self.balances.insert(from.clone(), nf);
        self.balances.insert(to.clone(), nt);
    }

    fn faucet_cfg() -> FaucetConfig {
        env::storage_read(FAUCET_CONFIG_KEY)
            .map(|b| near_sdk::borsh::from_slice(&b).unwrap_or_else(|_| env::panic_str("bad faucet config")))
            .unwrap_or_default()
    }

    fn faucet_claims() -> LookupMap<AccountId, FaucetClaim> {
        LookupMap::new(StorageKey::FaucetClaims)
    }

    /// Bytes of one new record keyed `[prefix(1)] ++ borsh(account)` (store::key::Identity; borsh string = u32 len + bytes).
    fn record_bytes(account: &AccountId, value_bytes: u64) -> u64 {
        // Account ids are <= 64 bytes, so these sums cannot overflow; checked anyway.
        (account.as_str().len() as u64)
            .checked_add(1 + 4 + RECORD_OVERHEAD_BYTES)
            .and_then(|k| k.checked_add(value_bytes))
            .unwrap_or_else(|| env::panic_str("overflow"))
    }
}

#[near]
impl MockFt {
    #[init]
    pub fn new(owner: AccountId, name: String, symbol: String, decimals: u8) -> Self {
        require!(decimals <= 24, "decimals > 24");
        Self { owner, name, symbol, decimals, total_supply: 0, balances: LookupMap::new(StorageKey::Balances) }
    }

    /// Owner-only mint (testnet faucet for the demo accounts).
    pub fn mint(&mut self, account_id: AccountId, amount: U128) {
        require!(env::predecessor_account_id() == self.owner, "owner only");
        require!(amount.0 > 0, "amount must be > 0");
        let nb = self.balance(&account_id).checked_add(amount.0).unwrap_or_else(|| env::panic_str("overflow"));
        self.total_supply = self.total_supply.checked_add(amount.0).unwrap_or_else(|| env::panic_str("overflow"));
        self.balances.insert(account_id, nb);
    }

    #[payable]
    pub fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        assert_one_yocto();
        let _ = memo;
        let sender = env::predecessor_account_id();
        self.internal_transfer(&sender, &receiver_id, amount.0);
    }

    #[payable]
    pub fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        assert_one_yocto();
        let _ = memo;
        require!(env::prepaid_gas() > GAS_FOR_FT_TRANSFER_CALL, "more gas is required");
        let sender = env::predecessor_account_id();
        self.internal_transfer(&sender, &receiver_id, amount.0);
        let receiver_gas = env::prepaid_gas()
            .saturating_sub(env::used_gas())
            .saturating_sub(GAS_FOR_RESOLVE)
            .saturating_sub(Gas::from_tgas(20));
        let args = json!({ "sender_id": sender, "amount": amount, "msg": msg }).to_string();
        let resolve = json!({ "sender_id": sender, "receiver_id": receiver_id, "amount": amount }).to_string();
        PromiseOrValue::Promise(
            Promise::new(receiver_id.clone())
                .function_call("ft_on_transfer", args.into_bytes(), NearToken::from_yoctonear(0), receiver_gas)
                .then(Promise::new(env::current_account_id()).function_call(
                    "ft_resolve_transfer",
                    resolve.into_bytes(),
                    NearToken::from_yoctonear(0),
                    GAS_FOR_RESOLVE,
                )),
        )
    }

    /// Returns the amount actually used by the receiver.
    #[private]
    pub fn ft_resolve_transfer(&mut self, sender_id: AccountId, receiver_id: AccountId, amount: U128) -> U128 {
        let amount = amount.0;
        let unused = match env::promise_result_checked(0, 64) {
            Ok(bytes) => near_sdk::serde_json::from_slice::<U128>(&bytes).map(|u| u.0.min(amount)).unwrap_or(amount),
            Err(_) => amount,
        };
        if unused == 0 {
            return U128(amount);
        }
        let rb = self.balance(&receiver_id);
        let refund = unused.min(rb);
        if refund > 0 {
            self.balances.insert(receiver_id, rb - refund);
            let sb = self.balance(&sender_id).checked_add(refund).unwrap_or_else(|| env::panic_str("overflow"));
            self.balances.insert(sender_id, sb);
        }
        U128(amount - refund)
    }

    pub fn ft_total_supply(&self) -> U128 {
        U128(self.total_supply)
    }

    pub fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        U128(self.balance(&account_id))
    }

    pub fn ft_metadata(&self) -> FtMetadata {
        FtMetadata {
            spec: "ft-1.0.0".to_string(),
            name: self.name.clone(),
            symbol: self.symbol.clone(),
            icon: None,
            reference: None,
            reference_hash: None,
            decimals: self.decimals,
        }
    }

    /// SR-27: registers the account (balance 0) for its measured storage cost and refunds the rest of the attachment;
    /// an already registered account gets the whole attachment back. The owner registers for free.
    #[payable]
    pub fn storage_deposit(&mut self, account_id: Option<AccountId>, registration_only: Option<bool>) -> StorageBalance {
        let _ = registration_only;
        let caller = env::predecessor_account_id();
        let a = account_id.unwrap_or_else(|| caller.clone());
        let attached = env::attached_deposit().as_yoctonear();
        let mut cost = 0;
        if !self.balances.contains_key(&a) {
            let before = env::storage_usage();
            self.balances.insert(a, 0);
            self.balances.flush();
            if caller != self.owner {
                let bytes = u128::from(env::storage_usage().saturating_sub(before));
                cost = bytes.checked_mul(env::storage_byte_cost().as_yoctonear()).unwrap_or_else(|| env::panic_str("overflow"));
                require!(attached >= cost, "attach the storage cost");
            }
        }
        if attached > cost {
            Promise::new(caller).transfer(NearToken::from_yoctonear(attached - cost)).detach();
        }
        StorageBalance { total: U128(STORAGE_BOUND_YOCTO), available: U128(0) }
    }

    /// `None` until the account is registered (NEP-145), so a client knows to pay `storage_deposit`.
    pub fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.balances.contains_key(&account_id).then_some(StorageBalance { total: U128(STORAGE_BOUND_YOCTO), available: U128(0) })
    }

    /// SR-27: accounts registered for free on first receipt so far.
    pub fn free_registrations(&self) -> u32 {
        env::storage_read(FREE_REGISTRATIONS_KEY)
            .and_then(|b| <[u8; 4]>::try_from(b.as_slice()).ok())
            .map_or(0, u32::from_le_bytes)
    }

    pub fn owner(&self) -> AccountId {
        self.owner.clone()
    }

    /// v7 A3: B20-style multiplier, WAD (default 1e18).
    pub fn multiplier(&self) -> U128 {
        U128(
            env::storage_read(MULTIPLIER_KEY)
                .and_then(|b| <[u8; 16]>::try_from(b.as_slice()).ok())
                .map_or(E18, u128::from_le_bytes),
        )
    }

    /// Owner-only (demo: a 2-for-1 split doubles M).
    pub fn update_multiplier(&mut self, multiplier_e18: U128) {
        require!(env::predecessor_account_id() == self.owner, "owner only");
        require!(multiplier_e18.0 > 0, "multiplier must be > 0");
        let old = self.multiplier();
        env::storage_write(MULTIPLIER_KEY, &multiplier_e18.0.to_le_bytes());
        env::log_str(&format!("multiplier updated {} -> {}", old.0, multiplier_e18.0));
    }

    /// Owner-only test switch (A4 `pay_to` failure path).
    pub fn set_registration_required(&mut self, required: bool) {
        require!(env::predecessor_account_id() == self.owner, "owner only");
        if required {
            env::storage_write(REGISTRATION_REQUIRED_KEY, &[1]);
        } else {
            env::storage_remove(REGISTRATION_REQUIRED_KEY);
        }
    }

    pub fn registration_required(&self) -> bool {
        env::storage_read(REGISTRATION_REQUIRED_KEY).is_some()
    }

    /// WO-61, owner-only. When enabled, `0 < amount_per_claim <= cap_per_account`.
    pub fn set_faucet(&mut self, amount_per_claim: U128, cap_per_account: U128, cooldown_s: u64, enabled: bool) {
        require!(env::predecessor_account_id() == self.owner, "owner only");
        require!(
            !enabled || (amount_per_claim.0 > 0 && amount_per_claim.0 <= cap_per_account.0),
            "need 0 < amount_per_claim <= cap_per_account"
        );
        require!(cooldown_s.checked_mul(NS_PER_S).is_some(), "cooldown_s too large");
        let cfg = FaucetConfig { enabled, amount_per_claim: amount_per_claim.0, cap_per_account: cap_per_account.0, cooldown_s };
        let bytes = near_sdk::borsh::to_vec(&cfg).unwrap_or_else(|_| env::panic_str("borsh"));
        env::storage_write(FAUCET_CONFIG_KEY, &bytes);
        env::log_str(&format!(
            "faucet set enabled={enabled} amount_per_claim={} cap_per_account={} cooldown_s={cooldown_s}",
            amount_per_claim.0, cap_per_account.0
        ));
    }

    /// WO-61: mints `amount_per_claim` to the caller (enabled, cooldown elapsed, cap not exceeded). The caller pays the
    /// measured storage this call adds and gets the rest of the attachment back; an existing claimant pays nothing.
    /// Creates the balance entry, so it registers the caller (also under `registration_required`).
    #[payable]
    pub fn faucet_mint(&mut self) {
        let caller = env::predecessor_account_id();
        let cfg = Self::faucet_cfg();
        require!(cfg.enabled, "faucet disabled");
        let now = env::block_timestamp();
        let mut claims = Self::faucet_claims();
        let prev = claims.get(&caller).copied();
        if let Some(c) = prev {
            let cooldown_ns = cfg.cooldown_s.checked_mul(NS_PER_S).unwrap_or_else(|| env::panic_str("overflow"));
            let next = c.last_claim_ns.checked_add(cooldown_ns).unwrap_or_else(|| env::panic_str("overflow"));
            require!(now >= next, format!("faucet cooldown: next claim at {next} ns"));
        }
        let amount = cfg.amount_per_claim;
        let claimed = prev
            .map_or(0, |c| c.claimed)
            .checked_add(amount)
            .unwrap_or_else(|| env::panic_str("overflow"));
        require!(claimed <= cfg.cap_per_account, "faucet cap reached");
        let attached = env::attached_deposit().as_yoctonear();
        // Effects: balance, supply, claim record; measure the bytes they add.
        let before = env::storage_usage();
        let nb = self.balance(&caller).checked_add(amount).unwrap_or_else(|| env::panic_str("overflow"));
        self.total_supply = self.total_supply.checked_add(amount).unwrap_or_else(|| env::panic_str("overflow"));
        self.balances.insert(caller.clone(), nb);
        claims.insert(caller.clone(), FaucetClaim { claimed, last_claim_ns: now });
        self.balances.flush();
        claims.flush();
        let bytes = u128::from(env::storage_usage().saturating_sub(before));
        let cost = bytes.checked_mul(env::storage_byte_cost().as_yoctonear()).unwrap_or_else(|| env::panic_str("overflow"));
        require!(attached >= cost, format!("attach the storage cost: {cost}"));
        let ev = json!({
            "standard": "nep141",
            "version": "1.0.0",
            "event": "ft_mint",
            "data": [{ "owner_id": caller, "amount": U128(amount), "memo": "faucet" }],
        });
        env::log_str(&format!("EVENT_JSON:{ev}"));
        // Interaction last: refund the unused attachment.
        if attached > cost {
            Promise::new(caller).transfer(NearToken::from_yoctonear(attached - cost)).detach();
        }
    }

    pub fn faucet_config(&self) -> FaucetConfigView {
        let c = Self::faucet_cfg();
        FaucetConfigView {
            enabled: c.enabled,
            amount_per_claim: U128(c.amount_per_claim),
            cap_per_account: U128(c.cap_per_account),
            cooldown_s: c.cooldown_s,
        }
    }

    /// `storage_cost_yocto` = what the next `faucet_mint` by this account would keep (0 once it has claimed).
    pub fn faucet_status(&self, account_id: AccountId) -> FaucetStatus {
        let cfg = Self::faucet_cfg();
        let prev = Self::faucet_claims().get(&account_id).copied();
        let claimed = prev.map_or(0, |c| c.claimed);
        let next = prev.map_or(0, |c| c.last_claim_ns.saturating_add(cfg.cooldown_s.saturating_mul(NS_PER_S)));
        let under_cap = claimed.checked_add(cfg.amount_per_claim).is_some_and(|n| n <= cfg.cap_per_account);
        let can_claim = cfg.enabled && cfg.amount_per_claim > 0 && under_cap && env::block_timestamp() >= next;
        let balance_bytes = if self.balances.contains_key(&account_id) { 0 } else { Self::record_bytes(&account_id, BALANCE_VALUE_BYTES) };
        let claim_bytes = if prev.is_some() { 0 } else { Self::record_bytes(&account_id, CLAIM_VALUE_BYTES) };
        let bytes = balance_bytes.checked_add(claim_bytes).unwrap_or_else(|| env::panic_str("overflow"));
        let cost = u128::from(bytes).checked_mul(env::storage_byte_cost().as_yoctonear()).unwrap_or_else(|| env::panic_str("overflow"));
        FaucetStatus { claimed: U128(claimed), next_claim_at_ns: U64(next), can_claim, storage_cost_yocto: U128(cost) }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{VMContextBuilder, accounts, get_logs};
    use near_sdk::{PromiseResult, testing_env};

    fn ctx(pred: AccountId, deposit: u128) -> VMContextBuilder {
        let mut b = VMContextBuilder::new();
        b.current_account_id("usdc".parse().unwrap())
            .predecessor_account_id(pred)
            .attached_deposit(NearToken::from_yoctonear(deposit))
            .prepaid_gas(Gas::from_tgas(300));
        b
    }

    fn setup() -> MockFt {
        testing_env!(ctx(accounts(0), 0).build());
        let mut t = MockFt::new(accounts(0), "Mock USDC".into(), "USDC".into(), 6);
        t.mint(accounts(1), U128(1_000));
        t.balances.flush(); // a real call starts with an empty cache; `storage_deposit` measures one insert
        t
    }

    #[test]
    fn new_and_metadata() {
        let t = setup();
        assert_eq!(t.ft_metadata().decimals, 6);
        assert_eq!(t.ft_metadata().spec, "ft-1.0.0");
        assert_eq!(t.owner(), accounts(0));
        assert_eq!(t.ft_total_supply(), U128(1_000));
        let _ = get_logs();
    }

    #[test]
    fn mint_owner_only() {
        let mut t = setup();
        t.mint(accounts(2), U128(5));
        assert_eq!(t.ft_balance_of(accounts(2)), U128(5));
        assert_eq!(t.ft_total_supply(), U128(1_005));
    }

    #[test]
    #[should_panic(expected = "owner only")]
    fn mint_rejects_non_owner() {
        let mut t = setup();
        testing_env!(ctx(accounts(1), 0).build());
        t.mint(accounts(1), U128(1));
    }

    #[test]
    fn ft_transfer_moves_balance() {
        let mut t = setup();
        testing_env!(ctx(accounts(1), 1).build());
        t.ft_transfer(accounts(2), U128(400), None);
        assert_eq!(t.ft_balance_of(accounts(1)), U128(600));
        assert_eq!(t.ft_balance_of(accounts(2)), U128(400));
    }

    #[test]
    #[should_panic(expected = "exactly 1 yoctoNEAR")]
    fn ft_transfer_requires_one_yocto() {
        let mut t = setup();
        testing_env!(ctx(accounts(1), 0).build());
        t.ft_transfer(accounts(2), U128(1), None);
    }

    #[test]
    #[should_panic(expected = "insufficient balance")]
    fn ft_transfer_insufficient() {
        let mut t = setup();
        testing_env!(ctx(accounts(1), 1).build());
        t.ft_transfer(accounts(2), U128(1_001), None);
    }

    #[test]
    fn ft_transfer_call_debits_sender() {
        let mut t = setup();
        testing_env!(ctx(accounts(1), 1).build());
        let _ = t.ft_transfer_call(accounts(2), U128(100), None, "x".into());
        assert_eq!(t.ft_balance_of(accounts(2)), U128(100));
    }

    fn resolve_with(result: PromiseResult) -> (MockFt, U128) {
        let mut t = setup();
        testing_env!(ctx(accounts(1), 1).build());
        let _ = t.ft_transfer_call(accounts(2), U128(100), None, "x".into());
        let c = ctx("usdc".parse().unwrap(), 0).build();
        testing_env!(
            c,
            near_sdk::test_vm_config(),
            near_sdk::RuntimeFeesConfig::test(),
            Default::default(),
            vec![result]
        );
        let used = t.ft_resolve_transfer(accounts(1), accounts(2), U128(100));
        (t, used)
    }

    #[test]
    fn resolve_refunds_unused() {
        let (t, used) = resolve_with(PromiseResult::Successful(b"\"30\"".to_vec()));
        assert_eq!(used, U128(70));
        assert_eq!(t.ft_balance_of(accounts(1)), U128(930));
        assert_eq!(t.ft_balance_of(accounts(2)), U128(70));
    }

    #[test]
    fn resolve_refunds_all_on_failure() {
        let (t, used) = resolve_with(PromiseResult::Failed);
        assert_eq!(used, U128(0));
        assert_eq!(t.ft_balance_of(accounts(1)), U128(1_000));
    }

    #[test]
    fn resolve_keeps_all_when_used() {
        let (t, used) = resolve_with(PromiseResult::Successful(b"\"0\"".to_vec()));
        assert_eq!(used, U128(100));
        assert_eq!(t.ft_balance_of(accounts(2)), U128(100));
    }

    #[test]
    fn multiplier_default_and_update() {
        let mut t = setup();
        assert_eq!(t.multiplier(), U128(E18));
        t.update_multiplier(U128(2 * E18));
        assert_eq!(t.multiplier(), U128(2 * E18));
        assert_eq!(t.ft_balance_of(accounts(1)), U128(1_000), "raw balances unchanged");
    }

    #[test]
    #[should_panic(expected = "owner only")]
    fn update_multiplier_owner_only() {
        let mut t = setup();
        testing_env!(ctx(accounts(1), 0).build());
        t.update_multiplier(U128(2 * E18));
    }

    #[test]
    #[should_panic(expected = "multiplier must be > 0")]
    fn update_multiplier_rejects_zero() {
        let mut t = setup();
        t.update_multiplier(U128(0));
    }

    #[test]
    fn registration_required_blocks_unregistered_receiver() {
        let mut t = setup();
        assert!(!t.registration_required());
        t.set_registration_required(true);
        assert!(t.registration_required());
        testing_env!(ctx(accounts(3), STORAGE_BOUND_YOCTO).build());
        t.storage_deposit(None, None);
        testing_env!(ctx(accounts(1), 1).build());
        t.ft_transfer(accounts(3), U128(5), None); // registered
        assert_eq!(t.ft_balance_of(accounts(3)), U128(5));
        testing_env!(ctx(accounts(0), 0).build());
        t.set_registration_required(false);
        assert!(!t.registration_required());
    }

    #[test]
    #[should_panic(expected = "receiver not registered")]
    fn registration_required_panics_for_unknown() {
        let mut t = setup();
        t.set_registration_required(true);
        testing_env!(ctx(accounts(1), 1).build());
        t.ft_transfer(accounts(4), U128(5), None);
    }

    #[test]
    #[should_panic(expected = "owner only")]
    fn set_registration_required_owner_only() {
        let mut t = setup();
        testing_env!(ctx(accounts(1), 0).build());
        t.set_registration_required(true);
    }

    #[test]
    fn storage_shims() {

        let mut t = setup();
        testing_env!(ctx(accounts(3), 1_250_000_000_000_000_000_000).build());
        let b = t.storage_deposit(None, Some(true));
        assert_eq!(b.available, U128(0));
        assert!(t.storage_balance_of(accounts(3)).is_some());
        assert_eq!(t.ft_balance_of(accounts(3)), U128(0));
    }

    fn refunded(to: &AccountId) -> u128 {
        near_sdk::test_utils::get_created_receipts()
            .iter()
            .filter(|r| &r.receiver_id == to)
            .flat_map(|r| r.actions.iter())
            .map(|a| match a {
                near_sdk::mock::MockAction::Transfer { deposit, .. } => deposit.as_yoctonear(),
                _ => 0,
            })
            .sum()
    }

    #[test]
    #[should_panic(expected = "attach the storage cost")]
    fn sr27_free_registration_refused() {
        let mut t = setup();
        testing_env!(ctx(accounts(3), 0).build());
        t.storage_deposit(Some(accounts(4)), None);
    }

    #[test]
    fn sr27_registration_keeps_the_measured_cost_and_refunds_the_rest() {
        let mut t = setup();
        let attached = 3 * STORAGE_BOUND_YOCTO;
        testing_env!(ctx(accounts(3), attached).build());
        t.storage_deposit(None, None);
        let back = refunded(&accounts(3));
        assert!(back > 0 && back < attached, "refund {back}");
        assert!(attached - back <= STORAGE_BOUND_YOCTO, "kept at most the bound");
    }

    #[test]
    fn sr27_already_registered_gets_everything_back() {
        let mut t = setup();
        testing_env!(ctx(accounts(1), 7).build());
        t.storage_deposit(None, None);
        assert_eq!(refunded(&accounts(1)), 7);
    }

    #[test]
    fn sr27_owner_registers_for_free() {
        let mut t = setup();
        testing_env!(ctx(accounts(0), 0).build());
        t.storage_deposit(Some(accounts(4)), None);
        assert!(t.storage_balance_of(accounts(4)).is_some());
        assert_eq!(t.free_registrations(), 0);
    }

    #[test]
    fn sr27_balance_of_is_none_until_registered() {
        let t = setup();
        assert!(t.storage_balance_of(accounts(4)).is_none());
        assert!(t.storage_balance_of(accounts(1)).is_some());
    }

    #[test]
    fn sr27_free_receipts_stop_at_the_cap() {
        let mut t = setup();
        testing_env!(ctx(accounts(1), 1).build());
        for i in 0..MAX_FREE_REGISTRATIONS {
            t.ft_transfer(format!("r{i}.test").parse().unwrap(), U128(1), None);
        }
        assert_eq!(t.free_registrations(), MAX_FREE_REGISTRATIONS);
        t.ft_transfer("r0.test".parse().unwrap(), U128(1), None); // known receivers still work
        let over = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            t.ft_transfer("late.test".parse().unwrap(), U128(1), None);
        }));
        assert!(over.is_err(), "the 65th free entry is refused");
    }

    // ---- WO-61 faucet ----
    const T0: u64 = 1_700_000_000_000_000_000;
    const BYTE: u128 = 10_000_000_000_000_000_000; // env::storage_byte_cost()

    fn at(pred: AccountId, deposit: u128, ts: u64) -> near_sdk::VMContext {
        let mut b = ctx(pred, deposit);
        b.block_timestamp(ts);
        b.build()
    }

    /// Owner enables 100 per claim, cap 250, cooldown 60 s.
    fn faucet_setup() -> MockFt {
        let mut t = setup();
        t.set_faucet(U128(100), U128(250), 60, true);
        t
    }

    fn rec(a: &AccountId, value: u128) -> u128 {
        (1 + 4 + a.as_str().len() as u128 + value + 40) * BYTE
    }

    fn claim_key(a: &AccountId) -> Vec<u8> {
        [vec![1u8], near_sdk::borsh::to_vec(a).unwrap()].concat()
    }

    #[test]
    fn faucet_defaults_disabled() {
        let t = setup();
        let c = t.faucet_config();
        assert_eq!(c, FaucetConfigView { enabled: false, amount_per_claim: U128(0), cap_per_account: U128(0), cooldown_s: 0 });
        let s = t.faucet_status(accounts(4));
        assert_eq!(s.claimed, U128(0));
        assert_eq!(s.next_claim_at_ns, U64(0));
        assert!(!s.can_claim);
        assert_eq!(s.storage_cost_yocto, U128(rec(&accounts(4), 16) + rec(&accounts(4), 24)));
    }

    #[test]
    #[should_panic(expected = "faucet disabled")]
    fn faucet_disabled_refused() {
        let mut t = setup();
        testing_env!(at(accounts(4), BYTE * 1_000, T0));
        t.faucet_mint();
    }

    #[test]
    #[should_panic(expected = "faucet disabled")]
    fn faucet_switched_off_refused() {
        let mut t = faucet_setup();
        t.set_faucet(U128(100), U128(250), 60, false);
        testing_env!(at(accounts(4), BYTE * 1_000, T0));
        t.faucet_mint();
    }

    #[test]
    #[should_panic(expected = "owner only")]
    fn set_faucet_owner_only() {
        let mut t = setup();
        testing_env!(ctx(accounts(1), 0).build());
        t.set_faucet(U128(100), U128(250), 60, true);
    }

    #[test]
    #[should_panic(expected = "need 0 < amount_per_claim <= cap_per_account")]
    fn set_faucet_rejects_amount_over_cap() {
        let mut t = setup();
        t.set_faucet(U128(300), U128(250), 60, true);
    }

    #[test]
    #[should_panic(expected = "cooldown_s too large")]
    fn set_faucet_rejects_huge_cooldown() {
        let mut t = setup();
        t.set_faucet(U128(1), U128(1), u64::MAX, true);
    }

    #[test]
    fn set_faucet_and_config_view() {
        let t = faucet_setup();
        assert_eq!(get_logs(), vec!["faucet set enabled=true amount_per_claim=100 cap_per_account=250 cooldown_s=60".to_string()]);
        assert_eq!(
            t.faucet_config(),
            FaucetConfigView { enabled: true, amount_per_claim: U128(100), cap_per_account: U128(250), cooldown_s: 60 }
        );
    }

    #[test]
    fn faucet_happy_path_new_account_charges_measured_storage_and_refunds_rest() {
        let mut t = faucet_setup();
        let a = accounts(4);
        testing_env!(at(a.clone(), 0, T0));
        let s = t.faucet_status(a.clone());
        assert!(s.can_claim);
        let cost = rec(&a, 16) + rec(&a, 24);
        assert_eq!(s.storage_cost_yocto, U128(cost), "prediction = balance record + claim record");
        testing_env!(at(a.clone(), cost + 5, T0));
        t.faucet_mint();
        assert_eq!(
            get_logs(),
            vec![format!(
                r#"EVENT_JSON:{{"standard":"nep141","version":"1.0.0","event":"ft_mint","data":[{{"owner_id":"{a}","amount":"100","memo":"faucet"}}]}}"#
            )]
        );
        assert_eq!(refunded(&a), 5, "kept exactly the measured cost");
        assert_eq!(t.ft_balance_of(a.clone()), U128(100));
        assert_eq!(t.ft_total_supply(), U128(1_100));
        assert!(t.storage_balance_of(a.clone()).is_some(), "a claim registers the caller");
        assert!(env::storage_has_key(&claim_key(&a)), "claims live under prefix [1]");
        let s = t.faucet_status(a.clone());
        assert_eq!(s.claimed, U128(100));
        assert_eq!(s.next_claim_at_ns, U64(T0 + 60 * NS_PER_S));
        assert!(!s.can_claim, "cooldown running");
        assert_eq!(s.storage_cost_yocto, U128(0));
        assert_eq!(t.free_registrations(), 0, "paid registration is not a free one");
    }

    #[test]
    fn faucet_exact_attachment_no_refund() {
        let mut t = faucet_setup();
        let a = accounts(4);
        let cost = rec(&a, 16) + rec(&a, 24);
        testing_env!(at(a.clone(), cost, T0));
        t.faucet_mint();
        assert_eq!(refunded(&a), 0);
        assert_eq!(t.ft_balance_of(a), U128(100));
    }

    #[test]
    #[should_panic(expected = "attach the storage cost: 1420000000000000000000")]
    fn faucet_underpaid_refused() {
        let mut t = faucet_setup();
        let a = accounts(4); // "eugene": (1+4+6+16+40) + (1+4+6+24+40) = 142 bytes
        testing_env!(at(a.clone(), rec(&a, 16) + rec(&a, 24) - 1, T0));
        t.faucet_mint();
    }

    #[test]
    fn faucet_registered_account_pays_claim_record_only() {
        let mut t = faucet_setup();
        let a = accounts(1); // has a balance from setup
        let cost = rec(&a, 24);
        assert_eq!(t.faucet_status(a.clone()).storage_cost_yocto, U128(cost));
        testing_env!(at(a.clone(), cost + 9, T0));
        t.faucet_mint();
        assert_eq!(refunded(&a), 9);
        assert_eq!(t.ft_balance_of(a), U128(1_100));
    }

    #[test]
    fn faucet_existing_claimant_pays_nothing_and_cooldown_elapses() {
        let mut t = faucet_setup();
        let a = accounts(4);
        testing_env!(at(a.clone(), BYTE * 1_000, T0));
        t.faucet_mint();
        testing_env!(at(a.clone(), 7, T0 + 60 * NS_PER_S));
        assert!(t.faucet_status(a.clone()).can_claim);
        t.faucet_mint();
        assert_eq!(refunded(&a), 7, "whole attachment back");
        assert_eq!(t.ft_balance_of(a.clone()), U128(200));
        let s = t.faucet_status(a);
        assert_eq!(s.claimed, U128(200));
        assert!(!s.can_claim);
    }

    #[test]
    #[should_panic(expected = "faucet cooldown: next claim at 1700000060000000000 ns")]
    fn faucet_cooldown_refused() {
        let mut t = faucet_setup();
        let a = accounts(4);
        testing_env!(at(a.clone(), BYTE * 1_000, T0));
        t.faucet_mint();
        testing_env!(at(a, 0, T0 + 60 * NS_PER_S - 1));
        t.faucet_mint();
    }

    #[test]
    #[should_panic(expected = "faucet cap reached")]
    fn faucet_cap_refused() {
        let mut t = faucet_setup();
        t.set_faucet(U128(100), U128(250), 0, true);
        let a = accounts(4);
        testing_env!(at(a.clone(), BYTE * 1_000, T0));
        t.faucet_mint();
        testing_env!(at(a.clone(), 0, T0));
        t.faucet_mint();
        assert!(!t.faucet_status(a.clone()).can_claim, "200 + 100 > 250");
        t.faucet_mint();
    }

    #[test]
    fn faucet_claim_counts_as_registration() {
        let mut t = faucet_setup();
        t.set_registration_required(true);
        let a = accounts(4);
        testing_env!(at(a.clone(), BYTE * 1_000, T0));
        t.faucet_mint();
        testing_env!(ctx(accounts(1), 1).build());
        t.ft_transfer(a.clone(), U128(5), None);
        assert_eq!(t.ft_balance_of(a), U128(105));
    }
}
