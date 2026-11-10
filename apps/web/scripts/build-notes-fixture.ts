// Builds e2e/fixtures/notes.json (WO-26c): Note SVGs from the contract template contracts/nectar-core/assets/position-note.svg with
// the placeholders filled the way notes.rs render_note does (labels and formats copied from quote_face / loan_face), plus the
// NEP-171 tokens and the Reserve views in the exact shapes of contracts/nectar-core/src/types.rs (WO-23b, merged 67a5426; checked
// below against the Rust structs). Also rewrites the Reserve parts of e2e/fixtures/v2-views.json (get_reserve, collateral `reserve`).
// No network, no keys. Run: node scripts/build-notes-fixture.ts
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const TEMPLATE = readFileSync(resolve(import.meta.dirname, "../../../contracts/nectar-core/assets/position-note.svg"), "utf8");
const CONTRACT = "nectar-core-v2.nectar.testnet";

function render(f: { type: string; id: string; asset: string; m: Array<[string, string]>; bar: number; status: string }): string {
  const v: Record<string, string> = { TYPE: f.type, ID: f.id, ASSET: f.asset, BAR_PCT: String(f.bar), STATUS: f.status, CONTRACT: CONTRACT };
  f.m.forEach(([l, val], i) => {
    v[`M${i + 1}_LABEL`] = l;
    v[`M${i + 1}_VALUE`] = val;
  });
  const out = TEMPLATE.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, k: string) => {
    if (!(k in v)) throw new Error(`no value for {{${k}}}`);
    return v[k]!;
  });
  return out;
}

const OWNER = "borrower1.nectar.testnet";
const svgs: Record<string, string> = {
  "q-3": render({ type: "QUOTE", id: "q-3", asset: "NVDAx", m: [["REMAINING", "$1,500.00"], ["MAX DISCOUNT", "2.50%"], ["UNLOCK", "NOTICE 24H"], ["CLAIMABLE FEES", "$1.25"]], bar: 25, status: "ACTIVE" }),
  "p-7": render({ type: "LOAN", id: "p-7", asset: "NVDAx", m: [["LTV", "5.61%"], ["HEALTH", "13.36"], ["DEBT", "$10.00"], ["BACKING Q+R", "$3,850.00"]], bar: 5, status: "OPEN" }),
  "p-8": render({ type: "LOAN", id: "p-8", asset: "NVDAx", m: [["LTV", "81.20%"], ["HEALTH", "0.92"], ["DEBT", "$40.00"], ["BACKING Q+R", "$3,850.00"]], bar: 81, status: "SETTLING" }),
  // reserve_face (notes.rs): VALUE, CLAIMABLE UNITS (2 dp), CLAIMABLE FEES, UNLOCK; bar = value / deposited (max 100).
  "r-NVDAx-1": render({ type: "RESERVE", id: "r-NVDAx-1", asset: "NVDAx", m: [["VALUE", "$25.40"], ["CLAIMABLE UNITS", "0.01"], ["CLAIMABLE FEES", "$0.40"], ["UNLOCK", "7D NOTICE"]], bar: 100, status: "ACTIVE" }),
  "r-NVDAx-2": render({ type: "RESERVE", id: "r-NVDAx-2", asset: "NVDAx", m: [["VALUE", "$10.10"], ["CLAIMABLE UNITS", "0.00"], ["CLAIMABLE FEES", "$0.10"], ["UNLOCK", "IN 2H"]], bar: 100, status: "EXITING" }),
};
const title = (id: string) => (id.startsWith("q-") ? `Quote Note ${id}` : id.startsWith("p-") ? `Loan Note ${id}` : `Reserve Note ${id}`);
const tokens = Object.keys(svgs).map((token_id) => ({
  token_id,
  owner_id: OWNER,
  metadata: { title: title(token_id), description: "Nectar Position Note (testnet, mock collateral).", media: null, copies: 1 },
  approved_account_ids: null,
}));

// ---- Reserve views (contract ReserveView / ReserveNoteView / ReserveNote / ReservePool)
const TYPES_RS = readFileSync(resolve(import.meta.dirname, "../../../contracts/nectar-core/src/types.rs"), "utf8");
function rustOrder(name: string): string[] {
  const m = TYPES_RS.match(new RegExp(`pub struct ${name} \\{([\\s\\S]*?)\\n\\}`));
  if (!m) throw new Error(`struct ${name} not found in types.rs`);
  return [...m[1]!.matchAll(/^\s*pub (\w+):/gm)].map((x) => x[1]!);
}
const rustFields = (name: string): string[] => rustOrder(name).sort();
function checkShape(name: string, o: object): void {
  const want = rustFields(name).join(",");
  const got = Object.keys(o).sort().join(",");
  if (want !== got) throw new Error(`${name} fixture keys differ from types.rs\n want ${want}\n got  ${got}`);
}
const WEEK_NS = "604800000000000";
const CREATED_NS = "1794200000000000000";
// R_c = usdc_e6 - notice_usdc_e6 = 35.50 - 10.10 = 25.40; active shares 25.00 (r-NVDAx-2 left the pool at notice);
// realised_apr_7d_bps = floor(fees_7d * 365 * 1e4 / (7 * R_c)) = floor(20070 * 3650000 / 177800000) = 412.
const getReserve = {
  symbol: "NVDAx",
  r_usd_e6: "25400000",
  shares: "25000000",
  usdc_e6: "35500000",
  notice_usdc_e6: "10100000",
  units: "12500",
  discount_bps: 600,
  acc_fee_per_share_e18: "16000000000000000",
  acc_units_per_share_e18: "500000000000000",
  share_price_e6: "1016000",
  min_deposit_usd_e6: "10000000",
  notice_period_ns: WEEK_NS,
  fees_7d_usd_e6: "20070",
  realised_apr_7d_bps: "412",
};
const note = (o: { n: number; deposited: string; shares: string; fees: string; unlock: string | null; exit_shares: string; exit_usdc: string }) => ({
  note_id: `r-NVDAx-${o.n}`,
  collateral: "NVDAx",
  owner: OWNER,
  deposited_usd_e6: o.deposited,
  shares: o.shares,
  unit_debt: "0",
  fee_debt: "0",
  claimable_units: "0",
  claimable_fees_usd_e6: o.fees,
  unlock_ns: o.unlock,
  exit_shares: o.exit_shares,
  exit_usdc_e6: o.exit_usdc,
  exited: false,
  created_ns: CREATED_NS,
});
const getReserveNote = {
  "r-NVDAx-1": { note: note({ n: 1, deposited: "25000000", shares: "25000000", fees: "0", unlock: null, exit_shares: "0", exit_usdc: "0" }), value_usd_e6: "25400000", claimable_units: "12500", claimable_fees_usd_e6: "400000", can_complete: false, transfer_locked: false },
  // unlock_ns "NOTICE_IN_2H" is replaced by now + 2 h in e2e/notes.spec.ts.
  "r-NVDAx-2": { note: note({ n: 2, deposited: "10000000", shares: "0", fees: "100000", unlock: "NOTICE_IN_2H", exit_shares: "10000000", exit_usdc: "10100000" }), value_usd_e6: "10100000", claimable_units: "0", claimable_fees_usd_e6: "100000", can_complete: false, transfer_locked: false },
};
checkShape("ReserveView", getReserve);
for (const v of Object.values(getReserveNote)) {
  checkShape("ReserveNoteView", v);
  checkShape("ReserveNote", v.note);
}

const fixture = {
  _comment: "Generated by apps/web/scripts/build-notes-fixture.ts from the contract SVG template and the types.rs Reserve shapes.",
  owner: OWNER,
  nft_token_svg: svgs,
  nft_tokens: tokens,
  nft_transfer_locked: { "p-8": true },
  get_quote_3: { id: "3", buyer: OWNER, collateral: "NVDAx", committed_usd_e6: "2000000000", remaining_usd_e6: "1500000000", max_discount_bps: 250, notice_period_ns: "86400000000000", unlock_ns: null, buyer_remote_recipient: null, claimable_fees_usd_e6: "1250000" },
  get_reserve: getReserve,
  get_reserve_note: getReserveNote,
};

// ---- e2e/fixtures/v2-views.json: v2 CollateralConfig carries `reserve` (no `nectar_reserve_usd_e6`); get_reserve of an enabled,
// empty pool (get_exit_capacity there reports r_usd_e6 = 0). Keys checked against CollateralConfig / ReservePool / ReserveView.
const V2_PATH = resolve(import.meta.dirname, "../e2e/fixtures/v2-views.json");
const v2 = JSON.parse(readFileSync(V2_PATH, "utf8")) as Record<string, unknown>;
const emptyPool = { shares: "0", usdc_e6: "0", notice_usdc_e6: "0", units: "0", discount_bps: 600, acc_fee_per_share_e18: "0", acc_units_per_share_e18: "0", notice_ns: WEEK_NS, fee_days: [] };
checkShape("ReservePool", emptyPool);
const coll = (c: Record<string, unknown>) => {
  const { nectar_reserve_usd_e6: _gone, ...rest } = c;
  const out = {
    remote_chain: null,
    shield: { weekend_fee_bps: 0, event_fee_bps: 0, event_window_end_ns: "0" },
    max_voluntary_fill_usd_e6_per_day: "0",
    voluntary_filled_today_e6: "0",
    voluntary_day: 0,
    ca_suggested_multiplier_e18: "0",
    ca_suggested_ns: "0",
    ...rest,
    reserve: emptyPool,
  };
  checkShape("CollateralConfig", out);
  return Object.fromEntries(rustOrder("CollateralConfig").map((k) => [k, out[k as keyof typeof out]]));
};
v2.get_collateral = coll(v2.get_collateral as Record<string, unknown>);
v2.list_collaterals = (v2.list_collaterals as Record<string, unknown>[]).map(coll);
v2.get_reserve = { ...getReserve, r_usd_e6: "0", shares: "0", usdc_e6: "0", notice_usdc_e6: "0", units: "0", acc_fee_per_share_e18: "0", acc_units_per_share_e18: "0", share_price_e6: "1000000", fees_7d_usd_e6: "0", realised_apr_7d_bps: "0" };
checkShape("ReserveView", v2.get_reserve as object);
writeFileSync(V2_PATH, `${JSON.stringify(v2, null, 2)}\n`);

writeFileSync(resolve(import.meta.dirname, "../e2e/fixtures/notes.json"), `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`wrote e2e/fixtures/notes.json (${Object.keys(svgs).length} SVGs, ${svgs["p-7"]!.length} bytes each approx.)`);
