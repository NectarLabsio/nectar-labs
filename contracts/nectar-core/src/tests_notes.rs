//! WO-22 unit tests: Position Notes (NEP-171/177/181), authority = Note owner, transfer locks, SVG render.
//! Every new public method and panic path. Names carry `v7_` for the G11 filter.

use super::*;
use crate::notes::*;
use crate::remote::RESERVE_DEPOSIT_YOCTO;
use near_sdk::mock::MockAction;
use near_sdk::test_utils::{VMContextBuilder, get_created_receipts, get_logs};
use near_sdk::{PromiseResult, testing_env};

const T0: u64 = 1_700_000_000_000_000_000;
const SEC: u64 = 1_000_000_000;
const UNITS: u128 = 100_000_000;
const VAULT: &str = "Nectar1Vau1t11111111111111111111111111111111";
const RCPT: &str = "3DTxgHcUXRb9uvpKwtasZN7YBUbbPuf3uvbBPjAGWqiV";
const AUTH_B58: &str = "2fhY3GjCcp4LU75uiiChUqQg9fS6xCtptLYZUdKJibpN";
const DEPOSITOR: &str = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";
const TX: &str = "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW";

fn a(s: &str) -> AccountId {
    s.parse().unwrap()
}
fn owner() -> AccountId {
    a("owner.test")
}
fn usdc() -> AccountId {
    a("usdc.test")
}
fn nvdax() -> AccountId {
    a("nvdax.test")
}
fn core() -> AccountId {
    a("core.test")
}
fn alice() -> AccountId {
    a("alice.test")
}
fn bob() -> AccountId {
    a("bob.test")
}
fn buyer1() -> AccountId {
    a("buyer1.test")
}

fn set_ctx(pred: AccountId, deposit: u128, ts: u64) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(core())
        .predecessor_account_id(pred.clone())
        .signer_account_id(pred)
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .block_timestamp(ts)
        .prepaid_gas(Gas::from_tgas(300));
    testing_env!(b.build());
}
fn cb_ctx(ts: u64, result: PromiseResult) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(core()).predecessor_account_id(core()).block_timestamp(ts).prepaid_gas(Gas::from_tgas(60));
    testing_env!(
        b.build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![result]
    );
}
fn nep171(name: &str, needle: &str) -> bool {
    get_logs().iter().any(|l| {
        l.starts_with("EVENT_JSON:{\"standard\":\"nep171\",\"version\":\"1.0.0\"")
            && l.contains(&format!("\"event\":\"{name}\""))
            && l.contains(needle)
    })
}
fn event_with(name: &str, needle: &str) -> bool {
    get_logs().iter().any(|l| l.contains(&format!("\"event\":\"{name}\"")) && l.contains(needle))
}
/// A created `ft_transfer` of `token` whose args name `receiver`.
fn ft_transfer_to(token: &AccountId, receiver: &AccountId) -> bool {
    get_created_receipts().iter().any(|r| {
        &r.receiver_id == token
            && r.actions.iter().any(|x| match x {
                MockAction::FunctionCallWeight { method_name, args, .. } => {
                    method_name == b"ft_transfer"
                        && String::from_utf8_lossy(args).contains(&format!("\"receiver_id\":\"{receiver}\""))
                }
                _ => false,
            })
    })
}
fn calls(receiver: &AccountId, method: &str) -> bool {
    get_created_receipts().iter().any(|r| {
        &r.receiver_id == receiver
            && r.actions.iter().any(|x| matches!(x, MockAction::FunctionCallWeight { method_name, .. } if method_name == method.as_bytes()))
    })
}

fn input(symbol: &str, token: AccountId) -> CollateralInput {
    CollateralInput {
        symbol: symbol.into(),
        token,
        decimals: 6,
        price_feed_id: "TODO-G5".into(),
        base_ltv_bps: 4000,
        max_nectar_ltv_bps: 7000,
        base_haircut_bps: 1000,
        weekend_haircut_bps: 2500,
        limit_premium_bps: 300,
        pre_liq_min_bps: 6500,
        pre_liq_max_bps: 8000,
        verified_dex_depth_usd_e6: U128(0),
        remote_chain: None,
        price_kind: None,
    }
}
fn ft_at(c: &mut Nectar, token: AccountId, sender: &str, amount: u128, msg: &str, ts: u64) -> u128 {
    set_ctx(token, 0, ts);
    match c.ft_on_transfer(a(sender), U128(amount), msg.to_string()) {
        PromiseOrValue::Value(v) => v.0,
        PromiseOrValue::Promise(_) => panic!("unexpected promise"),
    }
}
fn ft(c: &mut Nectar, token: AccountId, sender: &str, amount: u128, msg: &str) -> u128 {
    ft_at(c, token, sender, amount, msg, T0 + SEC)
}
fn fund(c: &mut Nectar, buyer: &str, amt: u128, disc: u16, remote: bool, opt_in: bool) {
    let rr = if remote { format!("\"{RCPT}\"") } else { "null".into() };
    let m = format!(
        r#"{{"FundPappusQuote":{{"collateral":"NVDAx","max_discount_bps":{disc},"notice_period_ns":"604800000000000","buyer_remote_recipient":{rr},"accepts_voluntary_fills":{opt_in}}}}}"#
    );
    assert_eq!(ft(c, usdc(), buyer, amt, &m), 0);
}
fn borrow_msg(borrow: u128) -> String {
    format!(r#"{{"LockCollateralAndBorrow":{{"collateral":"NVDAx","borrow_usd_e6":"{borrow}","pre_liq_ltv_bps":7500}}}}"#)
}

/// Price 180, gas reserve, lender $50k, quotes q-0 buyer1 $10k @250 (Solana recipient) + q-1 buyer2 $5k @400.
fn base() -> Nectar {
    set_ctx(owner(), 0, T0);
    let mut c = Nectar::new(owner(), usdc(), a("keeper.test"));
    c.upsert_collateral("NVDAx".into(), input("NVDAx", nvdax()));
    assert!(c.update_owner_price("NVDAx".into(), U128(180_000_000)));
    set_ctx(owner(), 1_000, T0);
    c.fund_gas_reserve();
    assert_eq!(ft(&mut c, usdc(), "lender.test", 50_000_000_000, r#""SupplyLendingLiquidity""#), 0);
    fund(&mut c, "buyer1.test", 10_000_000_000, 250, true, false);
    fund(&mut c, "buyer2.test", 5_000_000_000, 400, false, false);
    c
}
/// base + alice's NEAR loan p-0 ($10k on 100 units).
fn opened() -> Nectar {
    let mut c = base();
    assert_eq!(ft(&mut c, nvdax(), "alice.test", UNITS, &borrow_msg(10_000_000_000)), 0);
    c
}
fn xfer(c: &mut Nectar, from: AccountId, to: AccountId, id: &str) {
    set_ctx(from, 1, T0 + 2 * SEC);
    c.nft_transfer(to, id.into(), None, None);
}
fn owner_of(c: &Nectar, id: &str) -> AccountId {
    c.nft_token(id.into()).unwrap().owner_id
}

// ------------------------------------------------------------------ helpers

#[test]
fn v7_notes_ids_parse_canonical_only() {
    assert_eq!(parse_note_id("q-0"), Some(NoteRef::Quote(0)));
    assert_eq!(parse_note_id("p-42"), Some(NoteRef::Position(42)));
    assert_eq!(parse_note_id("r-NVDAx-1"), Some(NoteRef::Reserve(1)));
    assert_eq!(parse_note_id("r-A-B-7"), Some(NoteRef::Reserve(7)));
    for bad in ["q-", "q-01", "x-1", "q1", "q--1", "q-+1", "p-1a", "r--1", "r-NVDAx-01", "r-1", "q-99999999999999999999"] {
        assert_eq!(parse_note_id(bad), None, "{bad}");
    }
    assert_eq!((quote_note_id(3), position_note_id(4)), ("q-3".to_string(), "p-4".to_string()));
}

#[test]
fn v7_notes_base64_rfc4648_vectors() {
    for (i, o) in [("", ""), ("f", "Zg=="), ("fo", "Zm8="), ("foo", "Zm9v"), ("foob", "Zm9vYg=="), ("foobar", "Zm9vYmFy")] {
        assert_eq!(base64(i.as_bytes()), o);
    }
}

#[test]
fn v7_notes_xml_escape_and_number_formats() {
    assert_eq!(xml_escape(r#"a<b>&"c'"#), "a&lt;b&gt;&amp;&quot;c&apos;");
    assert_eq!(xml_escape("core.nectar.testnet"), "core.nectar.testnet");
    assert_eq!(fmt_usd(0), "$0.00");
    assert_eq!(fmt_usd(1_234_567_891), "$1,234.56");
    assert_eq!(fmt_usd(1_000_000_000_000_000), "$1,000,000,000.00");
    assert_eq!(fmt_bps(6_250), "62.50%");
    assert_eq!(fmt_bps(5), "0.05%");
}

#[test]
fn v7_notes_template_is_small_and_has_every_placeholder() {
    assert!(NOTE_SVG_TEMPLATE.len() <= 2_048, "{} bytes", NOTE_SVG_TEMPLATE.len());
    assert!(NOTE_SVG_TEMPLATE.contains(r#"width="600" height="360""#));
    for k in ["TYPE", "ID", "ASSET", "M1_LABEL", "M1_VALUE", "M2_LABEL", "M2_VALUE", "M3_LABEL", "M3_VALUE", "M4_LABEL", "M4_VALUE", "BAR_PCT", "STATUS", "CONTRACT"] {
        assert!(NOTE_SVG_TEMPLATE.contains(&format!("{{{{{k}}}}}")), "{k}");
    }
    for colour in ["#0d0f12", "#16f3a9", "#e6e9ef", "#8f96a3"] {
        assert!(NOTE_SVG_TEMPLATE.contains(colour), "{colour}");
    }
}

// ------------------------------------------------------------------ mint + views

#[test]
fn v7_notes_minted_on_funding_and_open_with_nep171_events() {
    let mut c = base();
    assert_eq!(ft(&mut c, nvdax(), "alice.test", UNITS, &borrow_msg(10_000_000_000)), 0);
    assert!(nep171("nft_mint", r#""owner_id":"alice.test","token_ids":["p-0"]"#), "{:?}", get_logs());
    fund(&mut c, "bob.test", 1_000_000_000, 300, false, false);
    assert!(nep171("nft_mint", r#""token_ids":["q-2"]"#));
    assert_eq!(c.nft_total_supply(), U128(4));
    assert_eq!(owner_of(&c, "q-0"), buyer1());
    assert_eq!(owner_of(&c, "p-0"), alice());
    assert_eq!(c.nft_supply_for_owner(bob()), U128(1));
    assert!(c.nft_token("q-9".into()).is_none() && c.nft_token("p-1".into()).is_none() && c.nft_token("zz".into()).is_none());
    let ids: Vec<String> = c.nft_tokens(None, None).into_iter().map(|t| t.token_id).collect();
    assert_eq!(ids, ["q-0", "q-1", "p-0", "q-2"]);
}

#[test]
fn v7_notes_metadata_and_token_media() {
    let c = opened();
    let m = c.nft_metadata();
    assert_eq!((m.spec.as_str(), m.symbol.as_str()), ("nft-1.0.0", "NOTE"));
    let t = c.nft_token("p-0".into()).unwrap();
    let md = t.metadata.unwrap();
    assert_eq!(md.title.as_deref(), Some("Loan Note p-0"));
    let svg = c.nft_token_svg("p-0".into());
    assert_eq!(md.media.as_deref(), Some(format!("data:image/svg+xml;base64,{}", base64(svg.as_bytes())).as_str()));
    assert_eq!(md.media_hash.unwrap().0, env::sha256(svg.as_bytes()));
    assert!(t.approved_account_ids.is_none());
}

#[test]
fn v7_notes_enumeration_pages_and_owner_lists_after_transfers() {
    let mut c = base();
    for _ in 0..4 {
        fund(&mut c, "bob.test", 1_000_000_000, 300, false, false); // q-2..q-5
    }
    assert_eq!(c.nft_supply_for_owner(bob()), U128(4));
    xfer(&mut c, bob(), alice(), "q-3"); // swap-remove from the middle
    xfer(&mut c, bob(), alice(), "q-2"); // and from the front
    let mut b: Vec<String> = c.nft_tokens_for_owner(bob(), None, None).into_iter().map(|t| t.token_id).collect();
    b.sort();
    assert_eq!(b, ["q-4", "q-5"]);
    let al: Vec<String> = c.nft_tokens_for_owner(alice(), None, None).into_iter().map(|t| t.token_id).collect();
    assert_eq!(al, ["q-3", "q-2"]);
    assert_eq!(c.nft_tokens_for_owner(alice(), Some(U128(1)), Some(5)).len(), 1);
    assert_eq!(c.nft_tokens(Some(U128(2)), Some(2)).len(), 2);
    assert_eq!(c.nft_tokens(Some(U128(99)), None).len(), 0);
    assert_eq!(c.nft_tokens(None, Some(1_000)).len(), 6, "capped at MAX_NOTE_PAGE, 6 exist");
    assert!(c.nft_tokens_for_owner(a("nobody.test"), None, None).is_empty());
}

#[test]
fn v7_notes_page_cap() {
    let mut c = base();
    for _ in 0..21 {
        fund(&mut c, "bob.test", 100_000_000, 300, false, false);
    }
    assert_eq!(c.nft_tokens(None, None).len() as u64, MAX_NOTE_PAGE);
    assert_eq!(c.nft_tokens_for_owner(bob(), None, Some(50)).len() as u64, MAX_NOTE_PAGE);
}

// ------------------------------------------------------------------ authority follows the Note

#[test]
fn v7_notes_quote_authority_moves_with_transfer() {
    let mut c = base();
    xfer(&mut c, buyer1(), bob(), "q-0");
    assert!(nep171("nft_transfer", r#""old_owner_id":"buyer1.test","new_owner_id":"bob.test","token_ids":["q-0"]"#));
    assert_eq!(c.get_quote(U64(0)).unwrap().buyer, bob());
    assert_eq!(owner_of(&c, "q-0"), bob());
    set_ctx(bob(), 1, T0 + 3 * SEC);
    c.initiate_quote_withdrawal(U64(0));
    set_ctx(bob(), 1, T0 + 3 * SEC + 604_800 * SEC);
    let _ = c.complete_quote_withdrawal(U64(0));
    assert!(ft_transfer_to(&usdc(), &bob()), "principal to the new owner");
}

#[test]
#[should_panic(expected = "buyer only")]
fn v7_notes_old_quote_owner_refused() {
    let mut c = base();
    xfer(&mut c, buyer1(), bob(), "q-0");
    set_ctx(buyer1(), 1, T0 + 3 * SEC);
    c.initiate_quote_withdrawal(U64(0));
}

#[test]
fn v7_notes_claim_fees_follows_note() {
    let mut c = opened(); // the premium accrued fees to q-0 and q-1
    xfer(&mut c, buyer1(), bob(), "q-0");
    set_ctx(bob(), 1, T0 + 3 * SEC);
    let _ = c.claim_fees(U64(0));
    assert!(ft_transfer_to(&usdc(), &bob()));
}

#[test]
#[should_panic(expected = "buyer only")]
fn v7_notes_claim_fees_old_owner_refused() {
    let mut c = opened();
    xfer(&mut c, buyer1(), bob(), "q-0");
    set_ctx(buyer1(), 1, T0 + 3 * SEC);
    let _ = c.claim_fees(U64(0));
}

#[test]
fn v7_notes_transfer_clears_remote_recipient_and_new_owner_sets_one() {
    let mut c = base();
    assert_eq!(c.get_quote(U64(0)).unwrap().buyer_remote_recipient.as_deref(), Some(RCPT));
    xfer(&mut c, buyer1(), bob(), "q-0");
    assert!(event_with("quote_remote_recipient_cleared", "\"quote_id\":\"0\""));
    assert_eq!(c.get_quote(U64(0)).unwrap().buyer_remote_recipient, None);
    set_ctx(bob(), 0, T0 + 3 * SEC);
    c.set_quote_remote_recipient(U64(0), Some(DEPOSITOR.into()));
    assert!(event_with("quote_remote_recipient_set", DEPOSITOR));
    assert_eq!(c.get_quote(U64(0)).unwrap().buyer_remote_recipient.as_deref(), Some(DEPOSITOR));
    c.set_quote_remote_recipient(U64(0), None);
    assert_eq!(c.get_quote(U64(0)).unwrap().buyer_remote_recipient, None);
}

#[test]
#[should_panic(expected = "note owner only")]
fn v7_notes_set_recipient_owner_only() {
    let mut c = base();
    set_ctx(bob(), 0, T0 + 3 * SEC);
    c.set_quote_remote_recipient(U64(0), Some(DEPOSITOR.into()));
}

#[test]
#[should_panic(expected = "bad recipient")]
fn v7_notes_set_recipient_validates_base58() {
    let mut c = base();
    set_ctx(buyer1(), 0, T0 + 3 * SEC);
    c.set_quote_remote_recipient(U64(0), Some("not<base58>".into()));
}

#[test]
#[should_panic(expected = "unknown quote")]
fn v7_notes_set_recipient_unknown_quote() {
    let mut c = base();
    set_ctx(buyer1(), 0, T0 + 3 * SEC);
    c.set_quote_remote_recipient(U64(9), None);
}

#[test]
fn v7_notes_residual_collateral_goes_to_loan_note_owner() {
    let mut c = opened();
    xfer(&mut c, alice(), bob(), "p-0");
    assert_eq!(c.get_position(U64(0)).unwrap().borrower, bob());
    // anyone may repay
    assert_eq!(ft(&mut c, usdc(), "stranger.test", 10_000_000_000, r#"{"Repay":{"position_id":"0"}}"#), 0);
    assert!(ft_transfer_to(&nvdax(), &bob()), "residual collateral to the Loan Note owner");
    assert!(!ft_transfer_to(&nvdax(), &alice()));
    assert_eq!(c.get_position(U64(0)).unwrap().status, PositionStatus::Closed);
    xfer(&mut c, bob(), alice(), "p-0"); // a closed Note still transfers
}

#[test]
fn v7_notes_self_settle_by_new_loan_owner() {
    let mut c = opened();
    fund(&mut c, "buyer3.test", 12_000_000_000, 200, false, true);
    set_ctx(owner(), 0, T0);
    c.set_max_voluntary_fill("NVDAx".into(), U128(20_000_000_000));
    xfer(&mut c, alice(), bob(), "p-0");
    set_ctx(bob(), 1, T0 + 3 * SEC);
    c.self_settle(U64(0));
    assert!(event_with("self_settled", "\"position_id\":\"0\""));
    assert!(ft_transfer_to(&nvdax(), &bob()), "remainder to the Loan Note owner");
}

#[test]
#[should_panic(expected = "borrower only")]
fn v7_notes_self_settle_old_owner_refused() {
    let mut c = opened();
    xfer(&mut c, alice(), bob(), "p-0");
    set_ctx(alice(), 1, T0 + 3 * SEC);
    c.self_settle(U64(0));
}

// ------------------------------------------------------------------ transfer panics

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn v7_notes_transfer_needs_one_yocto() {
    let mut c = base();
    set_ctx(buyer1(), 0, T0 + 2 * SEC);
    c.nft_transfer(bob(), "q-0".into(), None, None);
}

#[test]
#[should_panic(expected = "note owner only")]
fn v7_notes_transfer_owner_only() {
    let mut c = base();
    xfer(&mut c, bob(), alice(), "q-0");
}

#[test]
#[should_panic(expected = "unknown note")]
fn v7_notes_transfer_unknown_note() {
    let mut c = base();
    xfer(&mut c, buyer1(), bob(), "q-01");
}

#[test]
#[should_panic(expected = "Current and next owner must differ")]
fn v7_notes_transfer_to_self_refused() {
    let mut c = base();
    xfer(&mut c, buyer1(), buyer1(), "q-0");
}

#[test]
#[should_panic(expected = "string too long")]
fn v7_notes_transfer_memo_bounded() {
    let mut c = base();
    set_ctx(buyer1(), 1, T0 + 2 * SEC);
    c.nft_transfer(bob(), "q-0".into(), None, Some("m".repeat(129)));
}

#[test]
fn v7_notes_transfer_memo_in_event_and_approval_id_ignored() {
    let mut c = base();
    set_ctx(buyer1(), 1, T0 + 2 * SEC);
    c.nft_transfer(bob(), "q-0".into(), Some(7), Some("gift".into()));
    assert!(nep171("nft_transfer", r#""memo":"gift""#));
}

// ------------------------------------------------------------------ locks

/// alice's p-0 at price 125 (LTV 80%) with the OutLayer quoter pinned, triggered: Settling, q-0 + q-1 candidates.
fn quoter_settling() -> Nectar {
    let mut c = opened();
    for (i, px) in [155_000_000u128, 140_000_000, 125_000_000].into_iter().enumerate() {
        set_ctx(owner(), 0, T0 + (2 + i as u64) * SEC);
        assert!(c.update_owner_price("NVDAx".into(), U128(px)));
    }
    c.set_quoter_config(U128(100), 100, U64(100_000_000), 128, 30);
    c.set_quoter_pin("owner.testnet/nectar-quoter".into(), "ab".repeat(32));
    c.set_vol_bps("NVDAx".into(), 420);
    set_ctx(a("keeper.test"), 0, T0 + 5 * SEC);
    c.trigger_preliquidation(U64(0));
    assert_eq!(c.get_position(U64(0)).unwrap().status, PositionStatus::Settling);
    c
}

#[test]
fn v7_notes_locked_while_quoter_settling_then_free_after_cancel() {
    let mut c = quoter_settling();
    for id in ["p-0", "q-0", "q-1"] {
        assert!(c.nft_transfer_locked(id.into()), "{id}");
    }
    assert!(c.nft_token_svg("p-0".into()).contains(">SETTLING<"));
    assert!(c.nft_token_svg("q-0".into()).contains(">SETTLING<"));
    set_ctx(owner(), 0, T0 + 6 * SEC);
    c.cancel_settlement(U64(0));
    for id in ["p-0", "q-0", "q-1"] {
        assert!(!c.nft_transfer_locked(id.into()), "{id}");
    }
    xfer(&mut c, alice(), bob(), "p-0");
    xfer(&mut c, buyer1(), bob(), "q-0");
}

#[test]
#[should_panic(expected = "note_locked: pending settlement")]
fn v7_notes_loan_transfer_refused_while_settling() {
    let mut c = quoter_settling();
    xfer(&mut c, alice(), bob(), "p-0");
}

#[test]
#[should_panic(expected = "note_locked: pending settlement")]
fn v7_notes_candidate_quote_transfer_refused_while_settling() {
    let mut c = quoter_settling();
    xfer(&mut c, buyer1(), bob(), "q-0");
}

#[test]
#[should_panic(expected = "unknown note")]
fn v7_notes_transfer_locked_view_unknown() {
    let c = base();
    c.nft_transfer_locked("p-0".into());
}

/// Remote p-0 (alice, $10k on 100 units in the vault); q-2 buyer3 $12k @200 opted in with a Solana recipient.
fn remote_open() -> Nectar {
    let mut c = base();
    set_ctx(owner(), 0, T0);
    c.set_remote_chain(
        "NVDAx".into(),
        Some(RemoteChain { chain_id: "solana-devnet".into(), vault_program: VAULT.into(), mpc_domain_id: 1 }),
    );
    c.set_signer_config(a("v1.signer-prod.testnet"), "solana-devnet-v1".into(), 15, 3600);
    c.set_vault_read_config("nectar.testnet/vault-read".into(), "ab".repeat(32), U128(100), 50);
    set_ctx(alice(), RESERVE_DEPOSIT_YOCTO, T0 + SEC);
    let id = c.reserve_remote_position("NVDAx".into(), U128(UNITS), U128(10_000_000_000), 7500, None, None, None).0;
    cb_ctx(T0 + SEC, PromiseResult::Successful(serde_json::to_vec(&format!("ed25519:{AUTH_B58}")).unwrap()));
    c.on_authority(U64(id));
    assert!(c.nft_token("p-0".into()).is_none(), "no Loan Note before the deposit is proven");
    set_ctx(a("anyone.test"), 0, T0 + 2 * SEC);
    c.confirm_remote_deposit(U64(id));
    cb_ctx(
        T0 + 2 * SEC,
        PromiseResult::Successful(
            format!(
                r#"{{"position_id":"{id}","units":"{UNITS}","authority":"ed25519:{AUTH_B58}","depositor":"{DEPOSITOR}","slot_or_block":412345678}}"#
            )
            .into_bytes(),
        ),
    );
    c.on_deposit_verified(U64(id));
    assert!(nep171("nft_mint", r#""owner_id":"alice.test","token_ids":["p-0"]"#));
    fund(&mut c, "buyer3.test", 12_000_000_000, 200, true, true);
    set_ctx(owner(), 0, T0);
    c.set_max_voluntary_fill("NVDAx".into(), U128(20_000_000_000));
    c
}

#[test]
fn v7_notes_remote_leg_locks_quote_and_loan_until_relayed() {
    let mut c = remote_open();
    assert_eq!(owner_of(&c, "p-0"), alice());
    set_ctx(alice(), 1, T0 + 3 * SEC);
    c.self_settle(U64(0));
    assert!(c.nft_transfer_locked("p-0".into()) && c.nft_transfer_locked("q-2".into()));
    assert!(!c.nft_transfer_locked("q-0".into()), "a quote the leg did not use stays free");
    let d = c.get_pending_settlement(U64(0)).unwrap();
    cb_ctx(T0 + 4 * SEC, PromiseResult::Successful(format!(r#"{{"scheme":"Ed25519","signature":{:?}}}"#, vec![7u8; 64]).into_bytes()));
    c.on_signature(U64(0), U64(2), d.nonce);
    assert!(c.nft_transfer_locked("q-2".into()), "signed, not relayed");
    set_ctx(a("keeper.test"), 0, T0 + 5 * SEC);
    c.relay_settlement_result(U64(0), TX.into());
    assert!(!c.nft_transfer_locked("q-2".into()));
    xfer(&mut c, a("buyer3.test"), bob(), "q-2");
}

#[test]
fn v7_notes_remote_sign_failure_unlocks() {
    let mut c = remote_open();
    set_ctx(alice(), 1, T0 + 3 * SEC);
    c.self_settle(U64(0));
    let d = c.get_pending_settlement(U64(0)).unwrap();
    cb_ctx(T0 + 4 * SEC, PromiseResult::Failed);
    c.on_signature(U64(0), U64(2), d.nonce);
    assert!(!c.nft_transfer_locked("q-2".into()) && !c.nft_transfer_locked("p-0".into()));
}

#[test]
#[should_panic(expected = "note_locked: pending settlement")]
fn v7_notes_set_recipient_refused_while_locked() {
    let mut c = remote_open();
    set_ctx(alice(), 1, T0 + 3 * SEC);
    c.self_settle(U64(0));
    set_ctx(a("buyer3.test"), 0, T0 + 3 * SEC);
    c.set_quote_remote_recipient(U64(2), Some(DEPOSITOR.into()));
}

#[test]
fn v7_notes_releasing_locks_loan() {
    let mut c = remote_open();
    assert_eq!(ft(&mut c, usdc(), "stranger.test", 10_000_000_000, r#"{"Repay":{"position_id":"0"}}"#), 0);
    set_ctx(a("anyone.test"), 0, T0 + 3 * SEC);
    c.request_remote_release(U64(0));
    assert_eq!(c.get_position(U64(0)).unwrap().remote.unwrap().status, RemoteStatus::Releasing);
    assert!(c.nft_transfer_locked("p-0".into()));
    assert!(c.nft_token_svg("p-0".into()).contains(">RELEASING<"));
}

// ------------------------------------------------------------------ nft_transfer_call + resolve

#[test]
fn v7_notes_transfer_call_schedules_receiver_and_resolve() {
    let mut c = base();
    set_ctx(buyer1(), 1, T0 + 2 * SEC);
    let _ = c.nft_transfer_call(bob(), "q-0".into(), None, None, "hi".into());
    assert_eq!(owner_of(&c, "q-0"), bob());
    assert!(calls(&bob(), "nft_on_transfer"));
    assert!(calls(&core(), "nft_resolve_transfer"));
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn v7_notes_transfer_call_needs_one_yocto() {
    let mut c = base();
    set_ctx(buyer1(), 0, T0 + 2 * SEC);
    let _ = c.nft_transfer_call(bob(), "q-0".into(), None, None, String::new());
}

#[test]
#[should_panic(expected = "msg too long")]
fn v7_notes_transfer_call_msg_bounded() {
    let mut c = base();
    set_ctx(buyer1(), 1, T0 + 2 * SEC);
    let _ = c.nft_transfer_call(bob(), "q-0".into(), None, None, "m".repeat(4_097));
}

#[test]
#[should_panic(expected = "attach more gas")]
fn v7_notes_transfer_call_gas_floor() {
    let mut c = base();
    let mut b = VMContextBuilder::new();
    b.current_account_id(core())
        .predecessor_account_id(buyer1())
        .attached_deposit(NearToken::from_yoctonear(1))
        .prepaid_gas(Gas::from_tgas(25));
    testing_env!(b.build());
    let _ = c.nft_transfer_call(bob(), "q-0".into(), None, None, String::new());
}

fn resolve(c: &mut Nectar, result: PromiseResult) -> bool {
    cb_ctx(T0 + 3 * SEC, result);
    c.nft_resolve_transfer(buyer1(), bob(), "q-0".into(), None)
}

#[test]
fn v7_notes_resolve_keeps_reverts_and_respects_moves() {
    let mut c = base();
    xfer(&mut c, buyer1(), bob(), "q-0");
    assert!(resolve(&mut c, PromiseResult::Successful(b"false".to_vec())), "receiver keeps it");
    assert_eq!(owner_of(&c, "q-0"), bob());
    assert!(!resolve(&mut c, PromiseResult::Successful(b"true".to_vec())), "returned");
    assert_eq!(owner_of(&c, "q-0"), buyer1());
    assert!(nep171("nft_transfer", r#""old_owner_id":"bob.test","new_owner_id":"buyer1.test""#));
    xfer(&mut c, buyer1(), bob(), "q-0");
    assert!(!resolve(&mut c, PromiseResult::Failed), "a failed receiver returns it");
    assert_eq!(owner_of(&c, "q-0"), buyer1());
    // receiver no longer owns it -> nothing to return
    assert!(resolve(&mut c, PromiseResult::Successful(b"true".to_vec())));
    assert_eq!(owner_of(&c, "q-0"), buyer1());
    // unknown token
    cb_ctx(T0 + 3 * SEC, PromiseResult::Successful(b"true".to_vec()));
    assert!(c.nft_resolve_transfer(buyer1(), bob(), "q-77".into(), None));
}

#[test]
fn v7_notes_resolve_keeps_note_locked_meanwhile() {
    let mut c = quoter_settling();
    // pretend p-0 went to bob by transfer_call before the trigger: the Note now cannot move back
    cb_ctx(T0 + 6 * SEC, PromiseResult::Successful(b"true".to_vec()));
    assert!(c.nft_resolve_transfer(bob(), alice(), "p-0".into(), None));
    assert_eq!(owner_of(&c, "p-0"), alice());
    assert!(get_logs().iter().any(|l| l == "note kept by receiver: pending settlement"));
}

// ------------------------------------------------------------------ SVG

#[test]
fn v7_notes_svg_loan_and_quote_metrics() {
    let c = opened();
    let svg = c.nft_token_svg("p-0".into());
    assert!(!svg.contains("{{"), "every placeholder filled");
    for s in [">LOAN p-0<", ">LTV<", ">HEALTH<", ">DEBT<", ">BACKING Q+R<", ">$10,000.00<", ">55.56%<", ">1.34<", ">$15,000.00<", ">OPEN<", ">NVDAx<", "core.test | testnet", "width=\"55%\""] {
        assert!(svg.contains(s), "{s} in {svg}");
    }
    let q = c.nft_token_svg("q-1".into());
    for s in [">QUOTE q-1<", ">REMAINING<", ">$5,000.00<", ">MAX DISCOUNT<", ">4.00%<", ">UNLOCK<", ">NOTICE 168H<", ">CLAIMABLE FEES<", ">ACTIVE<", "width=\"0%\""] {
        assert!(q.contains(s), "{s} in {q}");
    }
    assert!(svg.len() < 2_048 && q.len() < 2_048);
}

#[test]
fn v7_notes_svg_quote_unlock_states() {
    let mut c = base();
    set_ctx(buyer1(), 1, T0 + 2 * SEC);
    c.initiate_quote_withdrawal(U64(0));
    set_ctx(buyer1(), 0, T0 + 2 * SEC + 3_600 * SEC);
    let s = c.nft_token_svg("q-0".into());
    assert!(s.contains(">IN 167H<") && s.contains(">EXITING<"), "{s}");
    set_ctx(buyer1(), 0, T0 + 2 * SEC + 604_800 * SEC);
    assert!(c.nft_token_svg("q-0".into()).contains(">NOW<"));
    set_ctx(buyer1(), 1, T0 + 2 * SEC + 604_800 * SEC);
    let _ = c.complete_quote_withdrawal(U64(0));
    assert!(c.nft_token_svg("q-0".into()).contains(">EMPTY<"));
}

#[test]
fn v7_notes_svg_escapes_the_asset_symbol() {
    let mut c = base();
    set_ctx(owner(), 0, T0);
    c.upsert_collateral("N<&>'".into(), input("N<&>'", a("odd.test")));
    let m = r#"{"FundPappusQuote":{"collateral":"N<&>'","max_discount_bps":300,"notice_period_ns":"604800000000000"}}"#;
    assert_eq!(ft(&mut c, usdc(), "bob.test", 100_000_000, m), 0);
    let s = c.nft_token_svg("q-2".into());
    assert!(s.contains(">N&lt;&amp;&gt;&apos;<"), "{s}");
    assert!(!s.contains("N<&>"));
}

#[test]
#[should_panic(expected = "unknown note")]
fn v7_notes_svg_unknown_note() {
    let c = base();
    c.nft_token_svg("p-0".into());
}
