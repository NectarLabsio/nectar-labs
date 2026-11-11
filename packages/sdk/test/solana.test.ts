// WO-31, WO-34w: nectar_vault v2 client bytes against solana/deploy.md and solana/client/{ed25519,pda,vault}.ts (byte-identical).
import { readFileSync } from "node:fs";
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { describe, expect, it } from "vitest";
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  CLAIM_ACCOUNT,
  DISCRIMINATOR,
  ED25519_PROGRAM_ADDRESS,
  INSTRUCTIONS_SYSVAR_ADDRESS,
  NONCE_RECORD_ACCOUNT,
  POSITION_ACCOUNT,
  POSITION_STATUS_OPEN,
  POSITION_STATUS_RELEASED,
  POSITION_STATUS_SETTLED,
  SYSTEM_PROGRAM_ADDRESS,
  TOKEN_PROGRAM_ADDRESS,
  associatedTokenAddress,
  authorityAsAddress,
  base58ToBytes,
  bytesToHex,
  claimData,
  claimInstruction,
  claimPda,
  compileWireTransaction,
  decodeTokenAccount,
  decodeVaultClaim,
  decodeVaultPosition,
  ed25519InstructionData,
  formatCountdown,
  formatEd25519Authority,
  formatLamports,
  hexToBytes,
  isSolanaWalletKey,
  largestFittingQuoteUsdE6,
  MAX_OPEN_RESERVATIONS,
  MIN_REMOTE_BORROW_USD_E6,
  borrowerCanConfirm,
  remoteConfirmRefusal,
  noncePda,
  openPositionData,
  openPositionInstruction,
  parseEd25519Authority,
  planRelease,
  positionPda,
  releaseData,
  releaseInstruction,
  releasePreimage,
  releaseTransactionInstructions,
  remoteAddressFits,
  remoteLoanRefusal,
  remotePath,
  remoteRefusalText,
  reservationSecondsLeft,
  settlementNeedsResign,
  SolanaReader,
  txRemote,
  vaultPda,
  vaultTokensPda,
  withdrawData,
  withdrawInstruction,
} from "../src/index";
import { parseConfig, toPublicConfig } from "../src/config";
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
interface ClientMeta { address: string; role: number }
interface ClientIx { programAddress: string; accounts: ClientMeta[]; data: Uint8Array }
const pdaClient = (await import(/* @vite-ignore */ new URL("../../../solana/client/pda.ts", import.meta.url).href)) as {
  positionAddress: (program: string, vault: string, id: bigint, depositor: string) => string;
  nonceAddress: (program: string, position: string, authority: Uint8Array, nonce: bigint) => string;
  claimAddress: (program: string, vault: string, recipient: string) => string;
  vaultAddress: (program: string, mint: string) => string;
  vaultTokensAddress: (program: string, vault: string) => string;
  associatedTokenAddress: (owner: string, mint: string, tokenProgram?: string) => string;
  isOnCurve: (key: Uint8Array) => boolean;
  TOKEN_2022_PROGRAM: string;
};
interface ClientIds { program: string; mint: string; vault: string; vaultTokens: string; tokenProgram: string }
const vaultClient = (await import(/* @vite-ignore */ new URL("../../../solana/client/vault.ts", import.meta.url).href)) as {
  DISCRIMINATOR: Record<string, readonly number[]>;
  ACCOUNT_DISCRIMINATOR: Record<string, readonly number[]>;
  POSITION_V2: Record<string, number>;
  CLAIM_V1: Record<string, number>;
  NONCE_RECORD_V2: { len: number };
  STATUS_OPEN: number;
  STATUS_SETTLED: number;
  STATUS_RELEASED: number;
  vaultIds: (program: string, mint: string, tokenProgram?: string) => ClientIds;
  parsePosition: (d: Uint8Array) => { depositor: string; amount: bigint; status: number; vault: string; positionId: bigint; bump: number; withdrawable: bigint };
  parseClaim: (d: Uint8Array) => { vault: string; recipient: string; amount: bigint; bump: number };
  openPositionInstruction: (ids: ClientIds, depositor: string, depositorTokens: string, f: { positionId: bigint; authority: Uint8Array; amount: bigint }) => ClientIx;
  releaseInstruction: (ids: ClientIds, payer: string, depositor: string, authority: Uint8Array, f: { positionId: bigint; nonce: bigint; expires: bigint }) => ClientIx;
  withdrawInstruction: (ids: ClientIds, depositor: string, positionId: bigint, destination: string) => ClientIx;
  claimInstruction: (ids: ClientIds, recipient: string, destination: string) => ClientIx;
};
const AUTH = `ed25519:${V.test_public_key_base58}`;

// Any valid base58 32-byte ids work for layout tests; these are the vector key and fixed test addresses.
const PROGRAM = "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS";
const MINT = "So11111111111111111111111111111111111111112";
const DEPOSITOR = "3DTxgHcUXRb9uvpKwtasZN7YBUbbPuf3uvbBPjAGWqiV";
const OTHER = V.test_public_key_base58;
const DESTINATION = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";

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

function positionBytes(f: { status: number; withdrawable: bigint }): Uint8Array {
  const b = new Uint8Array(POSITION_ACCOUNT.size);
  b.set(DISCRIMINATOR.position_account, 0);
  b[8] = 2;
  b.set(parseEd25519Authority(AUTH), 9);
  b.set(base58ToBytes(DEPOSITOR), 41);
  new DataView(b.buffer).setBigUint64(73, 2_500_000n, true);
  b[81] = f.status;
  b.set(base58ToBytes(PROGRAM), 82);
  new DataView(b.buffer).setBigUint64(114, 7n, true);
  b[122] = 254;
  new DataView(b.buffer).setBigUint64(123, f.withdrawable, true);
  return b;
}

function claimBytes(amount: bigint): Uint8Array {
  const b = new Uint8Array(CLAIM_ACCOUNT.size);
  b.set(DISCRIMINATOR.claim_account, 0);
  b[8] = 1;
  b.set(base58ToBytes(PROGRAM), 9);
  b.set(base58ToBytes(DEPOSITOR), 41);
  new DataView(b.buffer).setBigUint64(73, amount, true);
  b[81] = 253;
  return b;
}

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
  it("withdraw = disc ‖ u64 id (16 B); claim = disc (8 B)", () => {
    const w = withdrawData(7n);
    expect(w.length).toBe(16);
    expect([...w.slice(0, 8)]).toEqual([183, 18, 70, 156, 148, 109, 161, 34]);
    expect(le(w, 8)).toBe(7n);
    expect([...claimData()]).toEqual([62, 198, 214, 193, 213, 159, 108, 210]);
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
  it("vault, tokens, pos (depositor), nonce (position), claim, ATA", async () => {
    const vault = await vaultPda(PROGRAM, MINT);
    expect(vault).toBe(nobleFindPda([s("vault"), base58ToBytes(MINT)], PROGRAM));
    expect(await vaultTokensPda(PROGRAM, vault)).toBe(nobleFindPda([s("tokens"), base58ToBytes(vault)], PROGRAM));
    const pos = await positionPda(PROGRAM, vault, 7n, DEPOSITOR);
    expect(pos).toBe(nobleFindPda([s("pos"), base58ToBytes(vault), u64(7n), base58ToBytes(DEPOSITOR)], PROGRAM));
    const auth = parseEd25519Authority(AUTH);
    expect(await noncePda(PROGRAM, pos, auth, 3n)).toBe(nobleFindPda([s("nonce"), base58ToBytes(pos), auth, u64(3n)], PROGRAM));
    expect(await noncePda(PROGRAM, pos, new Uint8Array(32).fill(7), 3n)).not.toBe(await noncePda(PROGRAM, pos, auth, 3n));
    await expect(noncePda(PROGRAM, pos, auth.slice(1), 3n)).rejects.toThrow(/32 bytes/);
    expect(await claimPda(PROGRAM, vault, DEPOSITOR)).toBe(nobleFindPda([s("claim"), base58ToBytes(vault), base58ToBytes(DEPOSITOR)], PROGRAM));
    expect(await associatedTokenAddress(DEPOSITOR, MINT)).toBe(
      nobleFindPda([base58ToBytes(DEPOSITOR), base58ToBytes(TOKEN_PROGRAM_ADDRESS), base58ToBytes(MINT)], ASSOCIATED_TOKEN_PROGRAM_ADDRESS),
    );
  });
});

describe("byte-exact against solana/client (pda.ts, vault.ts)", () => {
  const clientIds = vaultClient.vaultIds(PROGRAM, MINT);
  const ids = { program: PROGRAM, mint: MINT };
  const same = (mine: { instruction: { programAddress: string; accounts?: readonly { address: string; role: number }[]; data: Uint8Array } }, theirs: ClientIx) => {
    expect(mine.instruction.programAddress).toBe(theirs.programAddress);
    expect(mine.instruction.accounts).toEqual(theirs.accounts);
    expect(bytesToHex(mine.instruction.data)).toBe(bytesToHex(theirs.data));
  };

  it("constants: discriminators and layouts", () => {
    for (const k of ["init_vault", "open_position", "settle", "release", "withdraw", "claim"] as const) expect([...DISCRIMINATOR[k]]).toEqual([...vaultClient.DISCRIMINATOR[k]!]);
    expect([...DISCRIMINATOR.position_account]).toEqual([...vaultClient.ACCOUNT_DISCRIMINATOR.Position!]);
    expect([...DISCRIMINATOR.claim_account]).toEqual([...vaultClient.ACCOUNT_DISCRIMINATOR.Claim!]);
    const P = vaultClient.POSITION_V2;
    expect(POSITION_ACCOUNT).toEqual({ size: P.len, version: P.version, authority: P.authority, depositor: P.depositor, amount: P.amount, status: P.status, vault: P.vault, position_id: P.positionId, bump: P.bump, withdrawable: P.withdrawable });
    const C = vaultClient.CLAIM_V1;
    expect(CLAIM_ACCOUNT).toEqual({ size: C.len, version: C.version, vault: C.vault, recipient: C.recipient, amount: C.amount, bump: C.bump });
    expect(NONCE_RECORD_ACCOUNT.size).toBe(vaultClient.NONCE_RECORD_V2.len);
    expect([POSITION_STATUS_OPEN, POSITION_STATUS_SETTLED, POSITION_STATUS_RELEASED]).toEqual([vaultClient.STATUS_OPEN, vaultClient.STATUS_SETTLED, vaultClient.STATUS_RELEASED]);
  });

  it("PDAs: every seed set, across ids and depositors", async () => {
    const vault = await vaultPda(PROGRAM, MINT);
    expect(vault).toBe(pdaClient.vaultAddress(PROGRAM, MINT));
    expect(await vaultTokensPda(PROGRAM, vault)).toBe(pdaClient.vaultTokensAddress(PROGRAM, vault));
    for (const [id, dep] of [[0n, DEPOSITOR], [7n, OTHER], [(1n << 64n) - 1n, DEPOSITOR]] as const) {
      const pos = await positionPda(PROGRAM, vault, id, dep);
      expect(pos).toBe(pdaClient.positionAddress(PROGRAM, vault, id, dep));
      for (const auth of [parseEd25519Authority(AUTH), new Uint8Array(32).fill(7)]) expect(await noncePda(PROGRAM, pos, auth, 9n)).toBe(pdaClient.nonceAddress(PROGRAM, pos, auth, 9n));
      expect(await claimPda(PROGRAM, vault, dep)).toBe(pdaClient.claimAddress(PROGRAM, vault, dep));
      expect(await associatedTokenAddress(dep, MINT)).toBe(pdaClient.associatedTokenAddress(dep, MINT));
    }
    expect(await positionPda(PROGRAM, vault, 7n, DEPOSITOR)).not.toBe(await positionPda(PROGRAM, vault, 7n, OTHER));
  });

  it("open_position", async () => {
    const mine = await openPositionInstruction(ids, { depositor: DEPOSITOR, positionId: 7n, authority: AUTH, amount: 1_000_000n });
    same(mine, vaultClient.openPositionInstruction(clientIds, DEPOSITOR, pdaClient.associatedTokenAddress(DEPOSITOR, MINT), { positionId: 7n, authority: parseEd25519Authority(AUTH), amount: 1_000_000n }));
  });
  it("release", async () => {
    const mine = await releaseInstruction(ids, { payer: OTHER, depositor: DEPOSITOR, authority: AUTH, positionId: 7n, nonce: 9n, expires: 1_800_000_000n });
    same(mine, vaultClient.releaseInstruction(clientIds, OTHER, DEPOSITOR, parseEd25519Authority(AUTH), { positionId: 7n, nonce: 9n, expires: 1_800_000_000n }));
  });
  it("withdraw", async () => {
    same(await withdrawInstruction(ids, { depositor: DEPOSITOR, positionId: 7n, destination: DESTINATION }), vaultClient.withdrawInstruction(clientIds, DEPOSITOR, 7n, DESTINATION));
  });
  it("claim", async () => {
    same(await claimInstruction(ids, { recipient: DEPOSITOR, destination: DESTINATION }), vaultClient.claimInstruction(clientIds, DEPOSITOR, DESTINATION));
  });
  it("Token-2022 mints use their own token program and ATA", async () => {
    const t22 = pdaClient.TOKEN_2022_PROGRAM;
    const mine = await withdrawInstruction({ ...ids, tokenProgram: t22 }, { depositor: DEPOSITOR, positionId: 7n, destination: DESTINATION });
    same(mine, vaultClient.withdrawInstruction(vaultClient.vaultIds(PROGRAM, MINT, t22), DEPOSITOR, 7n, DESTINATION));
    const open = await openPositionInstruction({ ...ids, tokenProgram: t22 }, { depositor: DEPOSITOR, positionId: 7n, authority: AUTH, amount: 1n });
    expect(open.accounts.find((a) => a.name === "depositor_tokens")!.address).toBe(pdaClient.associatedTokenAddress(DEPOSITOR, MINT, t22));
  });
  it("account parsers read the same fields", () => {
    const b = positionBytes({ status: 3, withdrawable: 2_500_000n });
    const mine = decodeVaultPosition(b);
    const theirs = vaultClient.parsePosition(b);
    expect([mine.depositor, mine.amount, mine.status, mine.vault, mine.positionId, mine.bump, mine.withdrawable]).toEqual([theirs.depositor, theirs.amount, theirs.status, theirs.vault, theirs.positionId, theirs.bump, theirs.withdrawable]);
    const c = claimBytes(700n);
    const claim = decodeVaultClaim(c);
    const clientClaim = vaultClient.parseClaim(c);
    expect([claim.vault, claim.recipient, claim.amount, claim.bump]).toEqual([clientClaim.vault, clientClaim.recipient, clientClaim.amount, clientClaim.bump]);
  });
  it("wallet-key check agrees with the on-curve predicate", async () => {
    const vault = await vaultPda(PROGRAM, MINT);
    expect(pdaClient.isOnCurve(base58ToBytes(DEPOSITOR))).toBe(true);
    expect(isSolanaWalletKey(DEPOSITOR)).toBe(true);
    expect(pdaClient.isOnCurve(base58ToBytes(vault))).toBe(false);
    expect(isSolanaWalletKey(vault)).toBe(false);
    expect(isSolanaWalletKey("not-an-address")).toBe(false);
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
      "payer", "vault", "position", "nonce_record", "instructions", "system_program",
    ]);
    expect(ixs[1]!.accounts[4]!.address).toBe(INSTRUCTIONS_SYSVAR_ADDRESS);
    // The nonce record is derived from the authority passed in (NEAR's `remote.authority`), the same key the verify ix checks.
    expect(ixs[1]!.accounts[3]!.address).toBe(await noncePda(PROGRAM, ixs[1]!.accounts[2]!.address, parseEd25519Authority(AUTH), 9n));
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

describe("Position and Claim accounts (deploy.md offsets)", () => {
  it("decodes a 131-byte v2 account", () => {
    const b = positionBytes({ status: 2, withdrawable: 1_250_000n });
    expect(decodeVaultPosition(b)).toEqual({ version: 2, authority: V.test_public_key_base58, depositor: DEPOSITOR, amount: 2_500_000n, status: 2, vault: PROGRAM, positionId: 7n, bump: 254, withdrawable: 1_250_000n });
    expect(() => decodeVaultPosition(b.slice(0, 123))).toThrow(/131/);
    const bad = b.slice();
    bad[0] = 0;
    expect(() => decodeVaultPosition(bad)).toThrow(/Position/);
    const v1 = b.slice();
    v1[8] = 1;
    expect(() => decodeVaultPosition(v1)).toThrow(/version/);
  });
  it("decodes an 82-byte Claim", () => {
    expect(decodeVaultClaim(claimBytes(700n))).toEqual({ version: 1, vault: PROGRAM, recipient: DEPOSITOR, amount: 700n, bump: 253 });
    expect(() => decodeVaultClaim(claimBytes(1n).slice(0, 80))).toThrow(/82/);
  });
  it("decodes the base of a token account", () => {
    const b = new Uint8Array(165);
    b.set(base58ToBytes(MINT), 0);
    b.set(base58ToBytes(DEPOSITOR), 32);
    new DataView(b.buffer).setBigUint64(64, 5n, true);
    b[108] = 2;
    expect(decodeTokenAccount(b)).toEqual({ mint: MINT, owner: DEPOSITOR, amount: 5n, state: 2 });
    expect(() => decodeTokenAccount(b.slice(0, 100))).toThrow(/165/);
  });
});

describe("SolanaReader checks the slot before trusting it", () => {
  const ids = { program: PROGRAM, mint: MINT };
  const b64 = (b: Uint8Array) => Buffer.from(b).toString("base64");
  async function readWith(owner: string, data: Uint8Array | null) {
    const realFetch = globalThis.fetch;
    const vault = await vaultPda(PROGRAM, MINT);
    const fixed = data?.slice() ?? null;
    fixed?.set(base58ToBytes(vault), POSITION_ACCOUNT.vault);
    let asked = "";
    globalThis.fetch = (async (_u: unknown, init?: { body?: string }) => {
      asked = (JSON.parse(init!.body!) as { params: string[] }).params[0]!;
      return new Response(JSON.stringify({ result: { value: fixed ? { owner, data: [b64(fixed), "base64"] } : null } }), { status: 200 });
    }) as typeof fetch;
    try {
      const out = await new SolanaReader("http://rpc.test").vaultPosition(ids, 7n, DEPOSITOR);
      return { out, asked, slot: await positionPda(PROGRAM, vault, 7n, DEPOSITOR) };
    } finally {
      globalThis.fetch = realFetch;
    }
  }
  it("reads the depositor's slot; null when absent", async () => {
    const none = await readWith(PROGRAM, null);
    expect(none.out).toBeNull();
    expect(none.asked).toBe(none.slot);
  });
  it("returns the account when the program owns it", async () => {
    expect((await readWith(PROGRAM, positionBytes({ status: 1, withdrawable: 0n }))).out?.status).toBe(1);
  });
  it("refuses an account another program owns", async () => {
    await expect(readWith(MINT, positionBytes({ status: 1, withdrawable: 0n }))).rejects.toThrow(/not owned/);
  });
  it("refuses an account for a different depositor", async () => {
    const b = positionBytes({ status: 1, withdrawable: 0n });
    b.set(base58ToBytes(OTHER), POSITION_ACCOUNT.depositor);
    await expect(readWith(PROGRAM, b)).rejects.toThrow(/does not match/);
  });
});

describe("NEAR remote lifecycle builders (interface-v7 §B)", () => {
  it("reserve, confirm, request release, expire", () => {
    const r = txRemote.reserve("core.testnet", { collateral: "NVDAx", units: "1000000", borrow_usd_e6: "10000000", pre_liq_ltv_bps: 7500, depositor: DEPOSITOR });
    expect(r.methodName).toBe("reserve_remote_position");
    expect(r.deposit).toBe("50000000000000000000000");
    expect(r.args).toEqual({ collateral: "NVDAx", units: "1000000", borrow_usd_e6: "10000000", pre_liq_ltv_bps: 7500, depositor: DEPOSITOR });
    expect(() => txRemote.reserve("c", { collateral: "NVDAx", units: (1n << 64n).toString(), borrow_usd_e6: "1", pre_liq_ltv_bps: 1, depositor: DEPOSITOR })).toThrow(/u64/);
    expect(txRemote.confirmDeposit("c", "7").methodName).toBe("confirm_remote_deposit");
    const rel = txRemote.requestRelease("c", "7");
    expect([rel.methodName, rel.deposit, rel.args]).toEqual(["request_remote_release", "0", { position_id: "7" }]);
    const re = txRemote.resignSettlement("c", "7");
    expect([re.methodName, re.deposit, re.args]).toEqual(["resign_remote_settlement", "0", { position_id: "7" }]);
    const owed = txRemote.claimOwedCollateral("c", "NVDAx");
    expect([owed.methodName, owed.deposit, owed.args]).toEqual(["claim_owed_collateral", "1", { symbol: "NVDAx" }]);
    expect(txRemote.expireReservation("c", "7").methodName).toBe("expire_remote_reservation");
    expect(remotePath("7")).toBe("solana-devnet/pos/7");
  });
  it("reserve commits a valid depositor for its chain", async () => {
    const pda = await vaultPda(PROGRAM, MINT);
    const base = { collateral: "NVDAx", units: "1", borrow_usd_e6: "5000000", pre_liq_ltv_bps: 7500 };
    expect(() => txRemote.reserve("c", { ...base, borrow_usd_e6: "4999999", depositor: DEPOSITOR })).toThrow(/\$5/);
    const evm = "0x00000000000000000000000000000000000000aB";
    expect(txRemote.reserve("c", { ...base, depositor: evm, chain: "base-sepolia" }).args).toEqual({ ...base, depositor: evm, chain: "base-sepolia" });
    expect(() => txRemote.reserve("c", { ...base, depositor: evm })).toThrow(/depositor/);
    expect(() => txRemote.reserve("c", { ...base, depositor: DEPOSITOR, chain: "base-sepolia" })).toThrow(/depositor/);
    expect(() => txRemote.reserve("c", { ...base, depositor: `0x${"0".repeat(40)}`, chain: "base-sepolia" })).toThrow(/depositor/);
    expect(() => txRemote.reserve("c", { ...base, depositor: pda })).toThrow(/depositor/);
  });
  it("the two non-payable calls match the contract", () => {
    const remote = readFileSync(new URL("../../../contracts/nectar-core/src/remote.rs", import.meta.url), "utf8");
    const p2 = readFileSync(new URL("../../../contracts/nectar-core/src/p2.rs", import.meta.url), "utf8");
    expect(remote).toMatch(/[^\n]*\*?\/\/\/[^\n]*Not payable\.\n\s*pub fn request_remote_release/);
    expect(p2).toMatch(/Not payable\.\n\s*pub fn resign_remote_settlement/);
  });
  it("largest fitting quote: skips exiting quotes and recipients on another chain", () => {
    const q = (remaining_usd_e6: string, buyer_remote_recipient: string | null, unlock_ns: string | null = null) => ({ remaining_usd_e6, buyer_remote_recipient, unlock_ns });
    const evm = "0x00000000000000000000000000000000000000aB";
    const quotes = [q("500", DEPOSITOR), q("900", null), q("800", evm), q("700", DEPOSITOR, "1"), q("600", OTHER)];
    expect(largestFittingQuoteUsdE6(quotes, 1)).toBe(600n);
    expect(largestFittingQuoteUsdE6(quotes, 0)).toBe(800n);
    expect(largestFittingQuoteUsdE6([], 1)).toBe(0n);
    expect(remoteAddressFits(7, DEPOSITOR)).toBe(false);
  });
  it("constants match the contract (SR-14)", () => {
    const lib = readFileSync(new URL("../../../contracts/nectar-core/src/lib.rs", import.meta.url), "utf8");
    const remote = readFileSync(new URL("../../../contracts/nectar-core/src/remote.rs", import.meta.url), "utf8");
    expect(MIN_REMOTE_BORROW_USD_E6.toString()).toBe(lib.match(/MIN_BORROW_USD_E6: u128 = ([\d_]+);/)![1]!.replace(/_/g, ""));
    expect(String(MAX_OPEN_RESERVATIONS)).toBe(remote.match(/MAX_OPEN_RESERVATIONS: u8 = (\d+);/)![1]);
  });
  it("the borrower's read needs the held deposit to cover it (SR-6)", () => {
    expect(borrowerCanConfirm({ deposit_yocto: "10" }, "10")).toBe(true);
    expect(borrowerCanConfirm({ deposit_yocto: "9" }, "10")).toBe(false);
    expect(borrowerCanConfirm({}, "10")).toBe(false);
    expect(borrowerCanConfirm({ deposit_yocto: "0" }, null)).toBe(true);
  });
  it("confirm refusal reads the reason from the event logs", () => {
    const ev = (event: string, reason: string) => `EVENT_JSON:${JSON.stringify({ standard: "nectar", version: "2.0.0", event, data: [{ position_id: "7", reason }] })}`;
    expect(remoteConfirmRefusal(["noise", ev("remote_loan_refused", "remote_settle_capacity")])).toBe("remote_settle_capacity");
    expect(remoteConfirmRefusal([ev("remote_deposit_rejected", "depositor_mismatch")])).toBe("depositor_mismatch");
    expect(remoteConfirmRefusal([ev("settled_near", "x"), "noise"])).toBeNull();
  });
  it("refusal text names the single-quote cap and leaves other failures alone", () => {
    expect(remoteRefusalText("Smart contract panicked: remote_settle_capacity")).toMatch(/single committed buyer/);
    expect(remoteRefusalText("Smart contract panicked: bad depositor")).toMatch(/depositor/);
    expect(remoteRefusalText("Smart contract panicked: borrow below minimum")).toMatch(/\$5/);
    expect(remoteRefusalText("Smart contract panicked: too many open reservations")).toMatch(/8 open/);
    expect(remoteRefusalText("Smart contract panicked: borrower, keeper or owner only")).toMatch(/borrower/);
    expect(remoteRefusalText("something else")).toBeNull();
    expect(remoteRefusalText(null)).toBeNull();
  });
  it("loan refusal: a recorded deposit that paid nothing", () => {
    const r = { status: "Open" as const, depositor: DEPOSITOR, reserved_units: "10", units: "9", paid_usd_e6: "0" };
    expect(remoteLoanRefusal({ debt_usd_e6: "0", remote: r })).toBe("short_deposit");
    expect(remoteLoanRefusal({ debt_usd_e6: "0", remote: { ...r, units: "10" } })).toBe("late_deposit");
    expect(remoteLoanRefusal({ debt_usd_e6: "0", remote: { ...r, paid_usd_e6: "5" } })).toBeNull();
    expect(remoteLoanRefusal({ debt_usd_e6: "5", remote: r })).toBeNull();
    expect(remoteLoanRefusal({ debt_usd_e6: "0", remote: { ...r, depositor: null } })).toBeNull();
    expect(remoteLoanRefusal({ debt_usd_e6: "0", remote: { ...r, status: "Releasing" as const } })).toBeNull();
  });
  it("re-sign: only once a signed leg has expired unrelayed", () => {
    const now = 1_700_000_000_000;
    expect(settlementNeedsResign({ status: "Signed", expires: "1700000000" }, now)).toBe(true);
    expect(settlementNeedsResign({ status: "Signed", expires: "1700000001" }, now)).toBe(false);
    expect(settlementNeedsResign({ status: "AwaitingSignature", expires: "1700000000" }, now)).toBe(true);
    expect(settlementNeedsResign({ status: "Relayed", expires: "1" }, now)).toBe(false);
    expect(settlementNeedsResign({ status: "Cancelled", expires: "1" }, now)).toBe(false);
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
  it("config: Solana vault ids — TODO → null, vault_program wins over program_id, defaults", () => {
    const base = (solana: string) =>
      toPublicConfig(parseConfig(`network: testnet\naccounts: { owner: o.testnet, core: TODO-G2, usdc_mock: u.testnet, nvdax_mock: n.testnet, keeper: k.testnet, demo: {} }\ncollateral: {}\noracle: { source: x }\n${solana}`));
    const pending = base("solana: { vault_program: TODO-G7, program_id: TODO-G7, mint: TODO-G7 }").solana;
    expect(pending).toEqual({ cluster: "devnet", vaultProgram: null, mint: null, decimals: 6 });
    const set = base("solana: { vault_program: VaultProg111, program_id: OldProg111, mint: Mint111, mint_decimals: 9 }").solana;
    expect(set).toEqual({ cluster: "devnet", vaultProgram: "VaultProg111", mint: "Mint111", decimals: 9 });
    expect(base("solana: { program_id: OldProg111 }").solana.vaultProgram).toBe("OldProg111");
    expect(base("solana: { vault_program: '' }").solana.vaultProgram).toBeNull();
    const none = base("");
    expect(none.solana).toEqual({ cluster: "devnet", vaultProgram: null, mint: null, decimals: 6 });
    expect(none.v7.reservation_expiry_s).toBe(1800);
    expect(none.v7.remote_path_prefix).toBe("solana-devnet/pos/");
    expect(none.core).toBeNull();
    expect(none.pending).toContain("accounts.core");
    expect(none.features.solana_remote).toBe(false);
  });
  it("config: live config.yaml solana block parses with correct types (values not pinned)", () => {
    const c = loadPublicConfig();
    expect(c.solana.cluster).toBe("devnet");
    expect(typeof c.solana.decimals).toBe("number");
    for (const v of [c.solana.vaultProgram, c.solana.mint]) expect(v === null || (typeof v === "string" && !v.startsWith("TODO-"))).toBe(true);
    expect(typeof c.v7.reservation_expiry_s).toBe("number");
    expect(typeof c.v7.remote_path_prefix).toBe("string");
    expect(typeof c.features.solana_remote).toBe("boolean");
  });
});
