//! Mock NEP-141 token for testnet (USDC / NVDAx stand-ins). NOT a production token.
//! - `ft_transfer` / `ft_transfer_call` require exactly 1 yoctoNEAR (F-013).
//! - `ft_transfer_call` calls `receiver.ft_on_transfer(sender_id, amount, msg)` and refunds the
//!   unused amount it returns in `ft_resolve_transfer` (F-013).
//! - Accounts auto-register on first receipt; `storage_deposit` exists only for script compatibility.
//! - `mint` is owner-only.

use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::store::LookupMap;
use near_sdk::{
    AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue, assert_one_yocto, env, near,
    require,
};

const GAS_FOR_RESOLVE: Gas = Gas::from_tgas(10);
const GAS_FOR_FT_TRANSFER_CALL: Gas = Gas::from_tgas(50);
/// Reported by `storage_balance_of` / `storage_deposit` (mock: storage is free).
const STORAGE_BOUND_YOCTO: u128 = 1_250_000_000_000_000_000_000;

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum StorageKey {
    Balances,
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
        let fb = self.balance(from);
        let nf = fb.checked_sub(amount).unwrap_or_else(|| env::panic_str("insufficient balance"));
        let nt = self.balance(to).checked_add(amount).unwrap_or_else(|| env::panic_str("balance overflow"));
        self.balances.insert(from.clone(), nf);
        self.balances.insert(to.clone(), nt);
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

    /// Compatibility shim: registers the account (balance 0) and keeps the deposit (mock).
    #[payable]
    pub fn storage_deposit(&mut self, account_id: Option<AccountId>, registration_only: Option<bool>) -> StorageBalance {
        let _ = registration_only;
        let a = account_id.unwrap_or_else(env::predecessor_account_id);
        if !self.balances.contains_key(&a) {
            self.balances.insert(a, 0);
        }
        StorageBalance { total: U128(STORAGE_BOUND_YOCTO), available: U128(0) }
    }

    pub fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        let _ = account_id;
        Some(StorageBalance { total: U128(STORAGE_BOUND_YOCTO), available: U128(0) })
    }

    pub fn owner(&self) -> AccountId {
        self.owner.clone()
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
    fn storage_shims() {
        let mut t = setup();
        testing_env!(ctx(accounts(3), 1_250_000_000_000_000_000_000).build());
        let b = t.storage_deposit(None, Some(true));
        assert_eq!(b.available, U128(0));
        assert!(t.storage_balance_of(accounts(3)).is_some());
        assert_eq!(t.ft_balance_of(accounts(3)), U128(0));
    }
}
