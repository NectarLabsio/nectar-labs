// WO-33c item 0: every view type in this SDK, compared key by key with the Rust struct it decodes. The live `get_quote` returned
// `quote_id` while `QuoteView` had only `id`; hand-written fixtures hid it. Keys come from the TypeScript checker and from the Rust
// source, so neither side can drift silently.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { NectarViews, type ViewTransport } from "../src/index";

const ROOT = resolve(import.meta.dirname, "../../..");
const RUST = ["types.rs", "notes.rs"].map((f) => readFileSync(resolve(ROOT, "contracts/nectar-core/src", f), "utf8")).join("\n");

function rustFields(name: string): string[] {
  const m = RUST.match(new RegExp(`((?:#\\[[^\\n]*\\]\\n)*)pub struct ${name} \\{([\\s\\S]*?)\\n\\}`));
  if (!m) throw new Error(`struct ${name} not found`);
  const camel = /rename_all = "camelCase"/.test(m[1]!);
  return [...m[2]!.matchAll(/^\s*pub (\w+):/gm)].map((x) => (camel ? x[1]!.replace(/_(\w)/g, (_, c: string) => c.toUpperCase()) : x[1]!)).sort();
}
function rustVariants(name: string): string[] {
  const m = RUST.match(new RegExp(`pub enum ${name} \\{([\\s\\S]*?)\\n\\}`));
  if (!m) throw new Error(`enum ${name} not found`);
  return [...m[1]!.matchAll(/^\s{4}(\w+),?\s*$/gm)].map((x) => x[1]!).sort();
}

const entry = resolve(import.meta.dirname, "../src/index.ts");
const program = ts.createProgram([entry], { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true, skipLibCheck: true, noEmit: true, types: ["node"] });
const checker = program.getTypeChecker();
const exported = checker.getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(entry)!)!);
function tsType(name: string): ts.Type {
  const sym = exported.find((e) => e.name === name);
  if (!sym) throw new Error(`type ${name} not exported`);
  return checker.getDeclaredTypeOfSymbol(sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym);
}
const tsKeys = (name: string) => checker.getPropertiesOfType(tsType(name)).map((p) => p.name).sort();
const tsUnion = (name: string) => {
  const t = tsType(name);
  return (t.isUnion() ? t.types : [t]).map((x) => String((x as ts.StringLiteralType).value)).sort();
};

/** TS type → Rust struct, with the keys that exist only on the TS side and why. */
const PAIRS: Array<{ ts: string; rust: string; tsOnly?: string[] }> = [
  { ts: "QuoteView", rust: "Quote", tsOnly: ["id"] }, // added by NectarViews
  { ts: "PositionView", rust: "Position", tsOnly: ["id"] }, // added by NectarViews
  { ts: "RemoteView", rust: "RemoteInfo" },
  { ts: "ShieldRecord", rust: "Shield" },
  { ts: "RemoteChain", rust: "RemoteChain" },
  // v1-only keys: the app still reads the v1 deployment.
  { ts: "CollateralView", rust: "CollateralConfig", tsOnly: ["market_session_open", "nectar_reserve_usd_e6"] },
  { ts: "CollateralUpsertInput", rust: "CollateralInput" },
  { ts: "ExitCapacity", rust: "ExitCapacityView" },
  { ts: "HealthView", rust: "HealthView" },
  { ts: "PoolView", rust: "PoolView" },
  { ts: "BorrowPreview", rust: "PreviewBorrowView" },
  { ts: "CoreConfigView", rust: "ConfigView" },
  { ts: "FeeSplit", rust: "FeeSplit" },
  { ts: "QuoterConfigView", rust: "QuoterConfigView" },
  { ts: "RemoteConfigView", rust: "RemoteConfigView" },
  { ts: "PendingRelease", rust: "PendingRelease" },
  { ts: "PendingSettlement", rust: "PendingSettlement" },
  { ts: "ShieldParams", rust: "ShieldParams" },
  { ts: "ShieldInput", rust: "ShieldInput" },
  { ts: "ShieldView", rust: "ShieldView" },
  { ts: "SelfSettleLegView", rust: "SelfSettleLegView" },
  { ts: "SelfSettlePreview", rust: "SelfSettlePreview" },
  { ts: "FeeStackView", rust: "FeeStackView" },
  { ts: "PayTo", rust: "PayTo" },
  { ts: "ReservePool", rust: "ReservePool" },
  { ts: "ReserveView", rust: "ReserveView" },
  { ts: "ReserveNote", rust: "ReserveNote" },
  { ts: "ReserveNoteView", rust: "ReserveNoteView" },
  { ts: "NoteToken", rust: "Token" },
  { ts: "NoteTokenMetadata", rust: "TokenMetadata" },
];

/** JSON structs in types.rs with no SDK view yet: internal, or served only to the keeper. A new struct must be added to one list or the other. */
const NOT_EXPOSED = ["ReserveFeeDay", "VaultReadConfig", "SecretsRef", "PythPrice", "SignerConfig", "ExtraRemoteChain", "EvmSigned", "RemoteChainView", "PendingSettlementEvm", "PendingReleaseEvm", "VaultAuthorityHint", "JobConfigView", "JobState", "MultiplierSource"];

const ENUMS: Array<[ts: string, rust: string]> = [
  ["PositionStatus", "PositionStatus"],
  ["RemoteStatus", "RemoteStatus"],
  ["ReleaseStatus", "ReleaseStatus"],
  ["PendingStatus", "PendingStatus"],
  ["ShieldKind", "ShieldKind"],
  ["PriceKind", "PriceKind"],
];

describe("SDK view types match contracts/nectar-core (keys)", () => {
  for (const p of PAIRS) {
    it(`${p.ts} = ${p.rust}`, () => {
      const allowed = new Set(p.tsOnly ?? []);
      expect(tsKeys(p.ts).filter((k) => !allowed.has(k))).toEqual(rustFields(p.rust));
    });
  }
  for (const [t, r] of ENUMS) {
    it(`${t} = enum ${r}`, () => expect(tsUnion(t)).toEqual(rustVariants(r)));
  }
  it("every JSON struct in types.rs is either compared or listed as not exposed", () => {
    const src = readFileSync(resolve(ROOT, "contracts/nectar-core/src/types.rs"), "utf8");
    const json = [...src.matchAll(/#\[near\(serializers = \[([^\]]*)\]\)\]\n(?:#\[[^\n]*\]\n)*pub struct (\w+)/g)].filter((m) => m[1]!.includes("json")).map((m) => m[2]!);
    const covered = new Set([...PAIRS.map((p) => p.rust), ...NOT_EXPOSED]);
    expect(json.filter((n) => !covered.has(n))).toEqual([]);
  });
});

describe("NectarViews maps the contract keys", () => {
  const quote = { quote_id: "3", buyer: "b.testnet", collateral: "NVDAx", committed_usd_e6: "1", remaining_usd_e6: "1", max_discount_bps: 250, notice_period_ns: "1", unlock_ns: null, buyer_remote_recipient: null };
  const position = { position_id: "7", borrower: "b.testnet", collateral: "NVDAx", units: "1", debt_usd_e6: "1", pre_liq_ltv_bps: 7500, opened_ns: "1", status: "Open" };
  const answers: Record<string, unknown> = { get_quote: quote, list_quotes: [quote], get_position: position, list_positions: [position] };
  const t: ViewTransport = { call: async <T>(_c: string, m: string) => answers[m] as T };
  const v = new NectarViews("core.testnet", t);

  it("get_quote and list_quotes: id comes from quote_id", async () => {
    expect((await v.getQuote("3"))?.id).toBe("3");
    expect((await v.listQuotes("NVDAx")).map((q) => q.id)).toEqual(["3"]);
  });
  it("get_position, list_positions and listAllPositions: id comes from position_id", async () => {
    expect((await v.getPosition("7"))?.id).toBe("7");
    expect((await v.listPositions()).map((p) => p.id)).toEqual(["7"]);
    expect((await v.listAllPositions()).map((p) => p.id)).toEqual(["7"]);
  });
  it("an absent quote stays null", async () => {
    const none = new NectarViews("core.testnet", { call: async <T>() => null as T });
    expect(await none.getQuote("9")).toBeNull();
  });
});

describe("writes that must match a contract constant", () => {
  it("reserve_remote_position attaches RESERVE_DEPOSIT_YOCTO", async () => {
    const { REMOTE_RESERVE_DEPOSIT_YOCTO } = await import("../src/remote");
    const rs = readFileSync(resolve(ROOT, "contracts/nectar-core/src/remote.rs"), "utf8");
    const m = rs.match(/RESERVE_DEPOSIT_YOCTO: u128 = ([\d_]+);/);
    expect(REMOTE_RESERVE_DEPOSIT_YOCTO).toBe(m![1]!.replace(/_/g, ""));
  });
});
