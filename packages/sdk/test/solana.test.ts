// WO-31: nectar_vault client bytes against solana/deploy.md, and the Ed25519 ix against solana/client/ed25519.ts (byte-identical).
import { readFileSync } from "node:fs";
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { describe, expect, it } from "vitest";
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  DISCRIMINATOR,
  ED25519_PROGRAM_ADDRESS,
  INSTRUCTIONS_SYSVAR_ADDRESS,
  POSITION_ACCOUNT,
  SYSTEM_PROGRAM_ADDRESS,
  TOKEN_PROGRAM_ADDRESS,
  associatedTokenAddress,
  authorityAsAddress,
  base58ToBytes,
  bytesToHex,
  compileWireTransaction,
  decodeVaultPosition,
  ed25519InstructionData,
  formatCountdown,
  formatEd25519Authority,
  formatLamports,
  hexToBytes,
  noncePda,
  openPositionData,
  openPositionInstruction,
  parseEd25519Authority,
  planRelease,
  positionPda,
  releaseData,
  releasePreimage,
  releaseTransactionInstructions,
  remotePath,
  reservationSecondsLeft,
  txRemote,
  vaultPda,
  vaultTokensPda,
} from "../src/index";
import { loadPublicConfig } from "../src/config-node";

interface Vectors {
  test_key_seed_hex: string;
  test_public_key_hex: string;
  test_public_key_base58: string;
  vectors: Array<{ preimage: string; signature_hex: string }>;
}
const V = JSON.parse(readFileSync(new URL("../../../contracts/nectar-core/tests/preimage_vectors.json", import.meta.url), "utf8")) as Vectors;
const SEED = hexToBytes(V.test_key_seed_hex);
// The reference implementation in solana/client (WO-14). Loaded by path at runtime: solana/ is not a workspace member, so tsc
// cannot resolve its type-only @solana/kit import from here; vitest strips it.
const CLIENT_ED = new URL("../../../solana/client/ed25519.ts", import.meta.url).href;
const CLIENT_PRE = new URL("../../../solana/client/preimage.ts", import.meta.url).href;
const { ed25519InstructionData: clientEd25519Data } = (await import(/* @vite-ignore */ CLIENT_ED)) as { ed25519InstructionData: (p: Uint8Array, s: Uint8Array, m: Uint8Array) => Uint8Array };
const { releasePreimage: clientReleasePreimage } = (await import(/* @vite-ignore */ CLIENT_PRE)) as {
  releasePreimage: (f: { program: string; positionId: bigint; recipient: string; nonce: bigint; expires: bigint }) => string;
};
const AUTH = `ed25519:${V.test_public_key_base58}`;

// Any valid base58 32-byte ids work for layout tests; these are the vector key and fixed test addresses.
const PROGRAM = "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS";
const MINT = "So11111111111111111111111111111111111111112";
const DEPOSITOR = "3DTxgHcUXRb9uvpKwtasZN7YBUbbPuf3uvbBPjAGWqiV";

const le = (b: Uint8Array, off: number) => new DataView(b.buffer, b.byteOffset).getBigUint64(off, true);

/** Independent PDA derivation (Solana find_program_address) with @noble, to cross-check kit's getProgramDerivedAddress. */
function nobleFindPda(seeds: Uint8Array[], program: string): string {
  const prog = base58ToBytes(program);
  const marker = new TextEncoder().encode("ProgramDerivedAddress");
  for (let bump = 255; bump >= 0; bump--) {
    const h = sha256(new Uint8Array([...seeds.flatMap((s) => [...s]), bump, ...prog, ...marker]));
    let onCurve = true;
    try {
      ed25519.Point.fromBytes(h, true);
    } catch {
      onCurve = false;
    }
    if (!onCurve) return authorityAsAddress(formatEd25519Authority(h));
  }
  throw new Error("no bump");
}
const u64 = (n: bigint) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, n, true);
  return b;
};
const s = (x: string) => new TextEncoder().encode(x);

describe("authority (ed25519:<b58> from nectar-core)", () => {
  it("decodes to the 32 key bytes and round-trips", () => {
    const b = parseEd25519Authority(AUTH);
    expect(bytesToHex(b)).toBe(V.test_public_key_hex);
    expect(formatEd25519Authority(b)).toBe(AUTH);
    expect(authorityAsAddress(AUTH)).toBe(V.test_public_key_base58);
    expect(bytesToHex(parseEd25519Authority(V.test_public_key_base58))).toBe(V.test_public_key_hex);
  });
  it("refuses secp256k1 and wrong lengths", () => {
    expect(() => parseEd25519Authority("secp256k1:4NfTiv3U")).toThrow(/ed25519/);
    expect(() => parseEd25519Authority("ed25519:111")).toThrow(/32 bytes/);
    expect(() => parseEd25519Authority("ed25519:0OIl")).toThrow(/base58/);
  });
});

describe("instruction data (deploy.md discriminators)", () => {
  it("open_position = disc ‖ u64 id ‖ authority ‖ u64 amount (56 B)", () => {
    const d = openPositionData(42n, parseEd25519Authority(AUTH), 1_500_000n);
    expect(d.length).toBe(56);
    expect([...d.slice(0, 8)]).toEqual([135, 128, 47, 77, 15, 152, 240, 49]);
    expect(le(d, 8)).toBe(42n);
    expect(bytesToHex(d.slice(16, 48))).toBe(V.test_public_key_hex);
    expect(le(d, 48)).toBe(1_500_000n);
    expect(() => openPositionData(1n, parseEd25519Authority(AUTH), 0n)).toThrow();
    expect(() => openPositionData(1n << 64n, parseEd25519Authority(AUTH), 1n)).toThrow(/u64/);
  });
  it("release = disc ‖ u64 id ‖ u64 nonce ‖ i64 expires (32 B)", () => {
    const d = releaseData(7n, 9n, 1_800_000_000n);
    expect(d.length).toBe(32);
    expect([...d.slice(0, 8)]).toEqual([...DISCRIMINATOR.release]);
    expect(le(d, 8)).toBe(7n);
    expect(le(d, 16)).toBe(9n);
    expect(new DataView(d.buffer).getBigInt64(24, true)).toBe(1_800_000_000n);
    const max = releaseData((1n << 64n) - 1n, (1n << 64n) - 1n, (1n << 63n) - 1n);
    expect(bytesToHex(max.slice(8))).toBe("ff".repeat(16) + "ffffffffffffff7f");
  });
});

describe("PDAs (deploy.md seeds) match an independent derivation", () => {
  it("vault, tokens, pos, nonce, ATA", async () => {
    const vault = await vaultPda(PROGRAM, MINT);
    expect(vault).toBe(nobleFindPda([s("vault"), base58ToBytes(MINT)], PROGRAM));
    expect(await vaultTokensPda(PROGRAM, vault)).toBe(nobleFindPda([s("tokens"), base58ToBytes(vault)], PROGRAM));
    expect(await positionPda(PROGRAM, vault, 7n)).toBe(nobleFindPda([s("pos"), base58ToBytes(vault), u64(7n)], PROGRAM));
    expect(await noncePda(PROGRAM, vault, 3n)).toBe(nobleFindPda([s("nonce"), base58ToBytes(vault), u64(3n)], PROGRAM));
    expect(await associatedTokenAddress(DEPOSITOR, MINT)).toBe(
      nobleFindPda([base58ToBytes(DEPOSITOR), base58ToBytes(TOKEN_PROGRAM_ADDRESS), base58ToBytes(MINT)], ASSOCIATED_TOKEN_PROGRAM_ADDRESS),
    );
  });
});

describe("Ed25519 verify ix (F-082)", () => {
  it("is byte-identical to solana/client/ed25519.ts over a real signed release message", () => {
    const msg = releasePreimage({ program: PROGRAM, positionId: 7n, recipient: DEPOSITOR, nonce: 9n, expires: 1_800_000_000n });
    expect(msg).toBe(clientReleasePreimage({ program: PROGRAM, positionId: 7n, recipient: DEPOSITOR, nonce: 9n, expires: 1_800_000_000n }));
    const bytes = new TextEncoder().encode(msg);
    const sig = ed25519.sign(bytes, SEED);
    const pub = parseEd25519Authority(AUTH);
    const mine = ed25519InstructionData(pub, sig, bytes);
    expect(bytesToHex(mine)).toBe(bytesToHex(clientEd25519Data(pub, sig, bytes)));
    expect(mine.length).toBe(112 + bytes.length);
    expect([...mine.slice(0, 16)]).toEqual([1, 0, 48, 0, 0xff, 0xff, 16, 0, 0xff, 0xff, 112, 0, bytes.length & 0xff, bytes.length >> 8, 0xff, 0xff]);
    expect(ed25519.verify(mine.slice(48, 112), mine.slice(112), mine.slice(16, 48))).toBe(true);
  });
  it("matches the client for every v1 vector signature", () => {
    const pub = hexToBytes(V.test_public_key_hex);
    for (const v of V.vectors) {
      const m = new TextEncoder().encode(v.preimage);
      const sig = hexToBytes(v.signature_hex);
      expect(bytesToHex(ed25519InstructionData(pub, sig, m))).toBe(bytesToHex(clientEd25519Data(pub, sig, m)));
    }
  });
});

describe("instructions and transaction", () => {
  it("open_position accounts in program order", async () => {
    const d = await openPositionInstruction({ program: PROGRAM, mint: MINT }, { depositor: DEPOSITOR, positionId: 7n, authority: AUTH, amount: 1_000_000n });
    expect(d.accounts.map((a) => a.name)).toEqual(["depositor", "vault", "mint", "vault_tokens", "depositor_tokens", "position", "token_program", "system_program"]);
    expect(d.accounts.map((a) => a.role)).toEqual([3, 0, 0, 1, 1, 1, 0, 0]);
    expect(d.accounts[6]!.address).toBe(TOKEN_PROGRAM_ADDRESS);
    expect(d.accounts[7]!.address).toBe(SYSTEM_PROGRAM_ADDRESS);
    expect(d.instruction.programAddress).toBe(PROGRAM);
    expect(d.args).toEqual({ position_id: "7", authority: V.test_public_key_base58, amount: "1000000" });
  });

  it("release tx = [ed25519 verify, release] with the deploy.md account order; plan checks the message", async () => {
    const expires = 1_800_000_000n;
    const msg = releasePreimage({ program: PROGRAM, positionId: 7n, recipient: DEPOSITOR, nonce: 9n, expires });
    const sigHex = bytesToHex(ed25519.sign(new TextEncoder().encode(msg), SEED));
    const pending = { message: msg, signature_hex: sigHex, nonce: "9", expires: expires.toString() };
    expect(() => planRelease(pending, { program: PROGRAM, positionId: 7n, depositor: V.test_public_key_base58 })).toThrow(/does not match/);
    expect(() => planRelease(pending, { program: PROGRAM, positionId: 8n, depositor: DEPOSITOR })).toThrow(/does not match/);
    expect(() => planRelease({ ...pending, signature_hex: "00" }, { program: PROGRAM, positionId: 7n, depositor: DEPOSITOR })).toThrow(/64 bytes/);
    const plan = planRelease(pending, { program: PROGRAM, positionId: 7n, depositor: DEPOSITOR });
    const ixs = await releaseTransactionInstructions({ program: PROGRAM, mint: MINT }, plan, { payer: DEPOSITOR, authority: AUTH });
    expect(ixs.map((i) => i.instruction.programAddress)).toEqual([ED25519_PROGRAM_ADDRESS, PROGRAM]);
    expect(ixs[0]!.accounts).toEqual([]);
    expect(ixs[1]!.accounts.map((a) => a.name)).toEqual([
      "payer", "vault", "mint", "vault_tokens", "position", "depositor", "depositor_tokens", "nonce_record", "instructions", "token_program", "associated_token_program", "system_program",
    ]);
    expect(ixs[1]!.accounts[8]!.address).toBe(INSTRUCTIONS_SYSVAR_ADDRESS);
    const wire = compileWireTransaction(ixs.map((i) => i.instruction), DEPOSITOR, { blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 100n });
    expect(wire[0]).toBe(1); // one signature slot (fee payer), empty until the wallet signs
    expect(wire.slice(1, 65).every((b) => b === 0)).toBe(true);
    expect(wire.length).toBeLessThanOrEqual(1232);
    const hex = bytesToHex(wire);
    const iEd = hex.indexOf(bytesToHex(ixs[0]!.instruction.data));
    const iRel = hex.indexOf(bytesToHex(ixs[1]!.instruction.data));
    expect(iEd).toBeGreaterThan(0);
    expect(iRel).toBeGreaterThan(iEd);
  });
});

describe("Position account (deploy.md offsets)", () => {
  it("decodes a 123-byte account", () => {
    const b = new Uint8Array(POSITION_ACCOUNT.size);
    b.set(DISCRIMINATOR.position_account, 0);
    b[8] = 1;
    b.set(parseEd25519Authority(AUTH), 9);
    b.set(base58ToBytes(DEPOSITOR), 41);
    new DataView(b.buffer).setBigUint64(73, 2_500_000n, true);
    b[81] = 1;
    b.set(base58ToBytes(PROGRAM), 82);
    new DataView(b.buffer).setBigUint64(114, 7n, true);
    b[122] = 254;
    const p = decodeVaultPosition(b);
    expect(p).toEqual({ version: 1, authority: V.test_public_key_base58, depositor: DEPOSITOR, amount: 2_500_000n, status: 1, vault: PROGRAM, positionId: 7n, bump: 254 });
    expect(() => decodeVaultPosition(b.slice(0, 100))).toThrow(/123/);
    const bad = b.slice();
    bad[0] = 0;
    expect(() => decodeVaultPosition(bad)).toThrow(/Position/);
  });
});

describe("NEAR remote lifecycle builders (interface-v7 §B)", () => {
  it("reserve, confirm, request release, expire", () => {
    const r = txRemote.reserve("core.testnet", { collateral: "NVDAx", units: "1000000", borrow_usd_e6: "10000000", pre_liq_ltv_bps: 7500 });
    expect(r.methodName).toBe("reserve_remote_position");
    expect(r.deposit).toBe("0");
    expect(r.args).toEqual({ collateral: "NVDAx", units: "1000000", borrow_usd_e6: "10000000", pre_liq_ltv_bps: 7500 });
    expect(() => txRemote.reserve("c", { collateral: "NVDAx", units: (1n << 64n).toString(), borrow_usd_e6: "1", pre_liq_ltv_bps: 1 })).toThrow(/u64/);
    expect(txRemote.confirmDeposit("c", "7").methodName).toBe("confirm_remote_deposit");
    const rel = txRemote.requestRelease("c", "7");
    expect([rel.methodName, rel.deposit, rel.args]).toEqual(["request_remote_release", "1", { position_id: "7" }]);
    expect(txRemote.expireReservation("c", "7").methodName).toBe("expire_remote_reservation");
    expect(remotePath("7")).toBe("solana-devnet/pos/7");
  });
  it("reservation countdown", () => {
    const now = 1_700_000_000_000;
    const reserved = BigInt(now) * 1_000_000n - 60n * 1_000_000_000n;
    expect(reservationSecondsLeft({ reserved_ns: reserved.toString() }, now)).toBe(1740);
    expect(reservationSecondsLeft({ expires_ns: (BigInt(now) * 1_000_000n - 1n).toString() }, now)).toBe(0);
    expect(reservationSecondsLeft({}, now)).toBeNull();
    expect(formatCountdown(1740)).toBe("29:00");
    expect(formatLamports(1_746_960n)).toBe("0.00174696 SOL");
  });
  it("config: Solana vault ids are null while TODO-G7", () => {
    const c = loadPublicConfig();
    expect(c.solana.cluster).toBe("devnet");
    expect(c.solana.decimals).toBe(6);
    expect(c.v7.reservation_expiry_s).toBe(1800);
    expect(c.v7.remote_path_prefix).toBe("solana-devnet/pos/");
    expect(c.features.solana_remote).toBe(false);
  });
});
