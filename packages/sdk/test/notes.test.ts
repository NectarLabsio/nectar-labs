import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  NOTE_GAS_TGAS,
  REALISED_APR_LABEL,
  RESERVE_MAX_NOTICE_NS,
  RESERVE_MIN_DEPOSIT_USD_E6,
  RESERVE_MIN_NOTICE_NS,
  RESERVE_NOTICE_NS,
  encodeMsg,
  formatNoticePeriod,
  formatRealisedApr,
  msgNotes,
  noteHref,
  noteSvgDataUri,
  noteTransferBlock,
  parseNoteId,
  positionNoteId,
  quoteNoteId,
  reserveExitState,
  shareToXUrl,
  tgas,
  tx,
  txNotes,
  txV1,
  txV2,
  type ReserveNote,
  type ReserveNoteView,
  type ReservePool,
  type ReserveView,
} from "../src";

const TEMPLATE = readFileSync(resolve(import.meta.dirname, "../../../contracts/nectar-core/assets/position-note.svg"), "utf8");
const fill = (o: Record<string, string>) => Object.entries(o).reduce((s, [k, v]) => s.split(`{{${k}}}`).join(v), TEMPLATE);
const LOAN = fill({ TYPE: "LOAN", ID: "p-7", ASSET: "NVDAx", M1_LABEL: "LTV", M1_VALUE: "5.61%", M2_LABEL: "HEALTH", M2_VALUE: "13.36", M3_LABEL: "DEBT", M3_VALUE: "$10.00", M4_LABEL: "BACKING Q+R", M4_VALUE: "$3,850.00", BAR_PCT: "5", STATUS: "OPEN", CONTRACT: "nectar-core-v2.nectar.testnet" });
const CORE = "nectar-core-v2.nectar.testnet";

describe("note ids (interface-v7 §C)", () => {
  it("parses q-, p-, r- ids and rejects everything else", () => {
    expect(parseNoteId("q-3")).toEqual({ kind: "QUOTE", id: "q-3", quote_id: "3" });
    expect(parseNoteId("p-0")).toEqual({ kind: "LOAN", id: "p-0", position_id: "0" });
    expect(parseNoteId("r-NVDAx-2")).toEqual({ kind: "RESERVE", id: "r-NVDAx-2", collateral: "NVDAx", n: "2" });
    for (const bad of ["q-", "q-01", "p-x", "x-1", "r-NVDAx", "r--1", "q-18446744073709551616", "p-1 "]) expect(parseNoteId(bad)).toBeNull();
    expect(quoteNoteId("12")).toBe("q-12");
    expect(positionNoteId(7)).toBe("p-7");
    expect(noteHref("r-NVDAx-2")).toBe("/note/r-NVDAx-2");
  });
});

describe("note SVG sanitiser", () => {
  it("accepts the contract template with placeholders filled, as a data URI", () => {
    expect(LOAN).not.toContain("{{");
    const uri = noteSvgDataUri(LOAN);
    expect(uri).toMatch(/^data:image\/svg\+xml;charset=utf-8,%3Csvg/);
    expect(decodeURIComponent(uri!.split(",").slice(1).join(","))).toBe(LOAN.trim());
  });
  it("accepts an xml-escaped asset", () => {
    expect(noteSvgDataUri(LOAN.replace(">NVDAx<", ">A&amp;B &lt;x&gt;<"))).not.toBeNull();
  });
  it("rejects scripts, handlers, links, styles, entities, foreign tags and oversize input", () => {
    const bad = [
      LOAN.replace("</svg>", "<script>alert(1)</script></svg>"),
      LOAN.replace('<rect width="600"', '<rect onload="alert(1)" width="600"'),
      LOAN.replace("</svg>", '<a href="https://example.com"><text>x</text></a></svg>'),
      LOAN.replace("</svg>", '<image href="https://example.com/x.png"/></svg>'),
      LOAN.replace('fill="#0d0f12"', 'fill="url(#g)"'),
      LOAN.replace('<rect width="600"', '<rect style="fill:red" width="600"'),
      `<!DOCTYPE svg [<!ENTITY x "y">]>${LOAN}`,
      LOAN.replace("</svg>", "<!-- c --></svg>"),
      LOAN.replace("</svg>", "<foreignObject><div/></foreignObject></svg>"),
      LOAN.replace(">NVDAx<", ">&x;<"),
      LOAN.replace(">NVDAx<", ">data:text/html<"),
      LOAN.replace("</svg>", `<text>${"a".repeat(17_000)}</text></svg>`),
      "<div>not svg</div>",
      "",
    ];
    for (const b of bad) expect(noteSvgDataUri(b)).toBeNull();
    expect(noteSvgDataUri(null)).toBeNull();
  });
});

describe("note calls", () => {
  it("nft_transfer: 1 yocto, memo only when set, ids validated", () => {
    const t = txNotes.nftTransfer(CORE, "p-7", "alice.testnet");
    expect(t).toMatchObject({ receiverId: CORE, methodName: "nft_transfer", deposit: "1", gas: tgas(NOTE_GAS_TGAS.nftTransfer), args: { receiver_id: "alice.testnet", token_id: "p-7" } });
    expect("memo" in t.args).toBe(false);
    expect(txNotes.nftTransfer(CORE, "q-1", "bob.testnet", "gift").args.memo).toBe("gift");
    expect(() => txNotes.nftTransfer(CORE, "z-1", "bob.testnet")).toThrow();
    expect(() => txNotes.nftTransfer(CORE, "p-1", "Bad Account")).toThrow();
  });
  it("set_quote_remote_recipient: no deposit, base58 checked, null clears", () => {
    const rcpt = "So11111111111111111111111111111111111111112";
    expect(txNotes.setQuoteRemoteRecipient(CORE, "2", rcpt)).toMatchObject({ methodName: "set_quote_remote_recipient", deposit: "0", args: { quote_id: "2", recipient: rcpt } });
    expect(txNotes.setQuoteRemoteRecipient(CORE, "2", null).args).toEqual({ quote_id: "2", recipient: null });
    expect(() => txNotes.setQuoteRemoteRecipient(CORE, "2", "not-base58-0OIl")).toThrow();
  });
  it("transfer block reasons", () => {
    const base = { viewer: "a.testnet", owner: "a.testnet", locked: false, receiver: "b.testnet" };
    expect(noteTransferBlock(base)).toBeNull();
    expect(noteTransferBlock({ ...base, viewer: null })).toMatch(/Connect/);
    expect(noteTransferBlock({ ...base, viewer: "c.testnet" })).toMatch(/owner/);
    expect(noteTransferBlock({ ...base, locked: true })).toMatch(/settlement/);
    expect(noteTransferBlock({ ...base, receiver: "a.testnet" })).toMatch(/already owns/);
    expect(noteTransferBlock({ ...base, receiver: "Bad" })).toMatch(/NEAR account/);
  });
  it("share link is a tweet intent with testnet + mock collateral copy", () => {
    const u = new URL(shareToXUrl("q-3", "https://nectar.example/note/q-3"));
    expect(u.hostname).toBe("x.com");
    expect(u.pathname).toBe("/intent/tweet");
    expect(u.searchParams.get("text")).toBe("My Nectar Quote Note q-3 on NEAR testnet (mock collateral).");
    expect(u.searchParams.get("url")).toBe("https://nectar.example/note/q-3");
  });
});

describe("Nectar Reserve (WO-23b, contract shapes)", () => {
  const TYPES_RS = readFileSync(resolve(import.meta.dirname, "../../../contracts/nectar-core/src/types.rs"), "utf8");
  const rustFields = (name: string): string[] => {
    const m = TYPES_RS.match(new RegExp(`pub struct ${name} \\{([\\s\\S]*?)\\n\\}`));
    if (!m) throw new Error(`struct ${name} not found`);
    return [...m[1]!.matchAll(/^\s*pub (\w+):/gm)].map((x) => x[1]!).sort();
  };
  const NOTE: ReserveNote = {
    note_id: "r-NVDAx-1", collateral: "NVDAx", owner: "alice.testnet", deposited_usd_e6: "25000000", shares: "25000000", unit_debt: "0", fee_debt: "0",
    claimable_units: "0", claimable_fees_usd_e6: "0", unlock_ns: null, exit_shares: "0", exit_usdc_e6: "0", exited: false, created_ns: "1",
  };
  const NV: ReserveNoteView = { note: NOTE, value_usd_e6: "25400000", claimable_units: "12500", claimable_fees_usd_e6: "400000", can_complete: false, transfer_locked: false };
  const RV: ReserveView = {
    symbol: "NVDAx", r_usd_e6: "25400000", shares: "35000000", usdc_e6: "35500000", notice_usdc_e6: "10100000", units: "12500", discount_bps: 600,
    acc_fee_per_share_e18: "0", acc_units_per_share_e18: "0", share_price_e6: "725714", min_deposit_usd_e6: "10000000", notice_period_ns: "604800000000000",
    fees_7d_usd_e6: "20000", realised_apr_7d_bps: "410",
  };
  const POOL: ReservePool = {
    shares: "0", usdc_e6: "0", notice_usdc_e6: "0", units: "0", discount_bps: 0, acc_fee_per_share_e18: "0", acc_units_per_share_e18: "0", notice_ns: "0", fee_days: [],
  };

  it("SDK view types carry exactly the contract's fields", () => {
    expect(Object.keys(RV).sort()).toEqual(rustFields("ReserveView"));
    expect(Object.keys(NV).sort()).toEqual(rustFields("ReserveNoteView"));
    expect(Object.keys(NOTE).sort()).toEqual(rustFields("ReserveNote"));
    expect(Object.keys(POOL).sort()).toEqual(rustFields("ReservePool"));
  });
  it("JoinNectarReserve msg and the $10 minimum", () => {
    expect(encodeMsg(msgNotes.joinNectarReserve("NVDAx"))).toBe('{"JoinNectarReserve":{"collateral":"NVDAx"}}');
    const t = txNotes.joinReserve("usdc.nectar.testnet", CORE, RESERVE_MIN_DEPOSIT_USD_E6.toString(), "NVDAx");
    expect(t).toMatchObject({ receiverId: "usdc.nectar.testnet", methodName: "ft_transfer_call", deposit: "1", gas: tgas(100) });
    expect(JSON.parse(String(t.args.msg))).toEqual({ JoinNectarReserve: { collateral: "NVDAx" } });
    expect(() => txNotes.joinReserve("usdc.nectar.testnet", CORE, "9990000", "NVDAx")).toThrow(/\$10/);
  });
  it("exit calls take Reserve Note ids only, 1 yocto", () => {
    expect(txNotes.initiateReserveExit(CORE, "r-NVDAx-1")).toMatchObject({ methodName: "initiate_reserve_exit", deposit: "1", args: { note_id: "r-NVDAx-1" } });
    expect(txNotes.completeReserveExit(CORE, "r-NVDAx-1")).toMatchObject({ methodName: "complete_reserve_exit", deposit: "1" });
    expect(() => txNotes.initiateReserveExit(CORE, "q-1")).toThrow();
  });
  it("exit state mirrors complete_reserve_exit", () => {
    const now = 1_000n * 1_000_000_000n;
    const at = (unlock: bigint | null, extra: Partial<ReserveNote> = {}, top: Partial<ReserveNoteView> = {}) =>
      reserveExitState({ ...NV, ...top, note: { ...NOTE, unlock_ns: unlock === null ? null : unlock.toString(), ...extra } }, now);
    expect(at(null)).toEqual({ kind: "none" });
    expect(at(now + 3_600n * 1_000_000_000n)).toEqual({ kind: "notice", seconds_left: 3600 });
    expect(at(now)).toEqual({ kind: "ready" });
    expect(at(now, { exited: true })).toEqual({ kind: "exited" });
    expect(at(now, {}, { value_usd_e6: "0", claimable_units: "0", claimable_fees_usd_e6: "0" })).toEqual({ kind: "exited" });
  });
  it("realised fee APR copy (D-024)", () => {
    expect(REALISED_APR_LABEL).toBe("Realised fee APR (trailing 7 days)");
    expect(formatRealisedApr("412", "25400000")).toBe("4.12 %");
    expect(formatRealisedApr("5")).toBe("0.05 %");
    expect(formatRealisedApr("0", "0")).toBe("no active deposits");
    expect(formatRealisedApr(null)).toBe("—");
    expect(formatNoticePeriod(RESERVE_NOTICE_NS)).toBe("7 days");
    expect(formatNoticePeriod(60_000_000_000n)).toBe("1 min");
  });
  it("owner set_reserve_params (v2) and v1-only set_reserve", () => {
    expect(txV2.setReserveParams(CORE, "NVDAx", 600)).toMatchObject({ methodName: "set_reserve_params", deposit: "0", args: { symbol: "NVDAx", discount_bps: 600 } });
    expect(txV2.setReserveParams(CORE, "NVDAx", 600).args).not.toHaveProperty("notice_ns");
    expect(txV2.setReserveParams(CORE, "NVDAx", 600, RESERVE_NOTICE_NS.toString()).args).toEqual({ symbol: "NVDAx", discount_bps: 600, notice_ns: "604800000000000" });
    expect(() => txV2.setReserveParams(CORE, "NVDAx", 0)).toThrow(/discount_bps/);
    expect(() => txV2.setReserveParams(CORE, "NVDAx", 10_000)).toThrow(/discount_bps/);
    expect(() => txV2.setReserveParams(CORE, "NVDAx", 600, (RESERVE_MIN_NOTICE_NS - 1n).toString())).toThrow(/60 s/);
    expect(() => txV2.setReserveParams(CORE, "NVDAx", 600, (RESERVE_MAX_NOTICE_NS + 1n).toString())).toThrow(/30 days/);
    expect(txV2.setReserveParams(CORE, "NVDAx", 600, RESERVE_MAX_NOTICE_NS.toString()).args.notice_ns).toBe("2592000000000000");
    expect("setReserve" in tx).toBe(false);
    expect(txV1.setReserve(CORE, "NVDAx", "1000000")).toMatchObject({ methodName: "set_reserve", args: { symbol: "NVDAx", reserve_usd_e6: "1000000" } });
  });
});
