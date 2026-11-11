// nectar_vault v2 on solana-test-validator (`anchor test`). A local Ed25519 key (the v1 vector test seed 0x07..07)
// stands in for the NEAR MPC-derived authority. Devnet uses the authority NEAR derives per position (TODO-G7).
// Every instruction after init_vault is built with solana/client/vault.ts, so these tests also pin the client bytes.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import anchor from "@coral-xyz/anchor";
import type { Program } from "@coral-xyz/anchor";
import {
  ComputeBudgetProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  AuthorityType,
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAccount,
  createAssociatedTokenAccount,
  createEnableRequiredMemoTransfersInstruction,
  createMint,
  createReallocateInstruction,
  freezeAccount,
  getAccount,
  getAssociatedTokenAddressSync,
  mintTo,
  setAuthority,
} from "@solana/spl-token";
import idl from "../target/idl/nectar_vault.json" with { type: "json" };
import type { NectarVault } from "../target/types/nectar_vault.ts";
import { ED25519_PROGRAM_ADDRESS, ed25519InstructionData, hexToBytes } from "../client/ed25519.ts";
import { claimAddress, findProgramAddress, keyBytes, nonceAddress, positionAddress, u64le } from "../client/pda.ts";
import { KIND_LEGACY, KIND_PRELIQ, KIND_SELF, releasePreimage, settlePreimage, utf8 } from "../client/preimage.ts";
import type { SettleKind } from "../client/preimage.ts";
import {
  ACCOUNT_DISCRIMINATOR,
  DISCRIMINATOR,
  OP_RELEASE,
  OP_SETTLE,
  STATUS_OPEN,
  STATUS_RELEASED,
  STATUS_SETTLED,
  claimInstruction,
  openPositionInstruction,
  parseClaim,
  parseNonceRecord,
  parsePosition,
  releaseInstruction,
  settleInstruction,
  vaultIds,
  withdrawInstruction,
} from "../client/vault.ts";
import type { SettleArgs, VaultIds, VaultInstruction } from "../client/vault.ts";
import { edKey, errText } from "./helpers.ts";
import type { EdKey } from "./helpers.ts";

const { AnchorProvider } = anchor;
const provider = AnchorProvider.env();
anchor.setProvider(provider);
const program = new anchor.Program<NectarVault>(idl as NectarVault, provider);
const conn = provider.connection;
const payer = (provider.wallet as unknown as { payer: Keypair }).payer;
const PROGRAM = program.programId.toBase58();
const PAYER = payer.publicKey.toBase58();
const OPTS = { commitment: "confirmed" as const };

// v1 vector `demo_leg` (contracts/nectar-core/tests/preimage_vectors.json): same fields except program (this deploy)
// and expires (future); signed by the same test key.
const VECTOR_SEED = "0707070707070707070707070707070707070707070707070707070707070707";
const DEMO_LEG = {
  positionId: 0n,
  quoteId: 0n,
  repayE6: 10_000_000_000n,
  seizeUnits: 57_544_379n,
  recipient: "3DTxgHcUXRb9uvpKwtasZN7YBUbbPuf3uvbBPjAGWqiV",
  nonce: 0n,
};

const AUTH: EdKey = edKey(hexToBytes(VECTOR_SEED));
const OTHER: EdKey = edKey(new Uint8Array(32).fill(0x42));
const K_ATTACKER: EdKey = edKey(new Uint8Array(32).fill(0x66));
const depositor = Keypair.generate();
const DEPOSITOR = depositor.publicKey.toBase58();
const buyer = Keypair.generate().publicKey.toBase58();
let mint: PublicKey;
let ids: VaultIds;
let depositorAta: PublicKey;

const future = (): bigint => BigInt(Math.floor(Date.now() / 1000) + 3600);
const pk = (a: string): PublicKey => new PublicKey(a);

const toIx = (i: VaultInstruction): TransactionInstruction =>
  new TransactionInstruction({
    programId: pk(i.programAddress),
    keys: i.accounts.map((a) => ({ pubkey: pk(a.address), isSigner: a.role >= 2, isWritable: (a.role & 1) === 1 })),
    data: Buffer.from(i.data),
  });

function verifyIx(key: EdKey, message: Uint8Array, signature?: Uint8Array): TransactionInstruction {
  const data = ed25519InstructionData(key.pub, signature ?? key.sign(message), message);
  return new TransactionInstruction({ programId: pk(ED25519_PROGRAM_ADDRESS), keys: [], data: Buffer.from(data) });
}

async function send(ixs: TransactionInstruction[], signers: Keypair[] = []): Promise<string> {
  return provider.sendAndConfirm(new Transaction().add(...ixs), signers, OPTS);
}

async function expectFail(p: Promise<unknown>, needle: string): Promise<void> {
  let err: unknown;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  assert.ok(err !== undefined, `expected failure containing "${needle}", but the transaction succeeded`);
  const text = errText(err);
  assert.ok(text.includes(needle), `expected "${needle}" in:\n${text.slice(0, 3000)}`);
}

const balance = async (ata: PublicKey): Promise<bigint> => (await getAccount(conn, ata, "confirmed")).amount;
const balance22 = async (ata: PublicKey): Promise<bigint> => (await getAccount(conn, ata, "confirmed", TOKEN_2022_PROGRAM_ID)).amount;
const rawAccount = async (a: string): Promise<Uint8Array | null> => {
  const info = await conn.getAccountInfo(pk(a), "confirmed");
  return info === null ? null : new Uint8Array(info.data);
};
const positionOf = (id: bigint, who: string = DEPOSITOR, v: VaultIds = ids): string => positionAddress(PROGRAM, v.vault, id, who);
const nonceOf = (n: bigint, id: bigint, who: string = DEPOSITOR, authority: Uint8Array = AUTH.pub): string =>
  nonceAddress(PROGRAM, positionOf(id, who), authority, n);
const claimOf = (recipient: string, v: VaultIds = ids): string => claimAddress(PROGRAM, v.vault, recipient);

async function readPosition(id: bigint, who: string = DEPOSITOR, v: VaultIds = ids) {
  const raw = await rawAccount(positionOf(id, who, v));
  assert.ok(raw, `position ${id} exists`);
  return parsePosition(raw);
}

async function fund(k: Keypair): Promise<void> {
  const sig = await conn.requestAirdrop(k.publicKey, 2 * LAMPORTS_PER_SOL);
  await conn.confirmTransaction(sig, "confirmed");
}

interface Holder {
  kp: Keypair;
  key: string;
  ata: PublicKey;
}

/** A funded wallet with an ATA holding `units` of the classic test mint. */
async function holder(units: bigint): Promise<Holder> {
  const kp = Keypair.generate();
  await fund(kp);
  const ata = await createAssociatedTokenAccount(conn, payer, mint, kp.publicKey, OPTS);
  await mintTo(conn, payer, mint, ata, payer, units, [], OPTS);
  return { kp, key: kp.publicKey.toBase58(), ata };
}

async function open(id: bigint, amount: bigint, who?: Holder, authority: Uint8Array = AUTH.pub): Promise<void> {
  const kp = who?.kp ?? depositor;
  const ata = who?.ata ?? depositorAta;
  await send([toIx(openPositionInstruction(ids, kp.publicKey.toBase58(), ata.toBase58(), { positionId: id, authority, amount }))], [kp]);
}

const settleMessage = (a: SettleArgs): Uint8Array => utf8(settlePreimage({ ...a, program: PROGRAM, kind: a.kind as SettleKind }));
const settleIx = (a: SettleArgs, who: string = DEPOSITOR, v: VaultIds = ids, authority: Uint8Array = AUTH.pub): VaultInstruction =>
  settleInstruction(v, PAYER, who, authority, a);
const signedSettle = (a: SettleArgs, who: string = DEPOSITOR, key: EdKey = AUTH, v: VaultIds = ids): TransactionInstruction[] => [
  verifyIx(key, settleMessage(a)),
  toIx(settleIx(a, who, v, key.pub)),
];

const releaseMessage = (positionId: bigint, nonce: bigint, expires: bigint, who: string = DEPOSITOR): Uint8Array =>
  utf8(releasePreimage({ program: PROGRAM, positionId, recipient: who, nonce, expires }));
const releaseIx = (positionId: bigint, nonce: bigint, expires: bigint, who: string = DEPOSITOR, authority: Uint8Array = AUTH.pub): VaultInstruction =>
  releaseInstruction(ids, PAYER, who, authority, { positionId, nonce, expires });
const signedRelease = (positionId: bigint, nonce: bigint, who: string = DEPOSITOR, key: EdKey = AUTH): TransactionInstruction[] => {
  const expires = future();
  return [verifyIx(key, releaseMessage(positionId, nonce, expires, who)), toIx(releaseIx(positionId, nonce, expires, who, key.pub))];
};

const withdraw = (id: bigint, kp: Keypair, destination: PublicKey, v: VaultIds = ids): Promise<string> =>
  send([toIx(withdrawInstruction(v, kp.publicKey.toBase58(), id, destination.toBase58()))], [kp]);
const anyTokenAccount = (owner: PublicKey): Promise<PublicKey> => createAccount(conn, payer, mint, owner, Keypair.generate(), OPTS);

const VICTIM = 20n; // stays open through the negative tests
const VICTIM_UNITS = 50_000_000n;
const victimSettle = (over: Partial<SettleArgs> = {}): SettleArgs => ({
  positionId: VICTIM,
  quoteId: 99n,
  repayE6: 1_000_000n,
  seizeUnits: 10_000_000n,
  recipient: buyer,
  nonce: 1000n,
  expires: future(),
  kind: KIND_PRELIQ,
  ...over,
});

before(async () => {
  await fund(depositor);
  mint = await createMint(conn, payer, payer.publicKey, payer.publicKey, 6, undefined, OPTS);
  depositorAta = await createAssociatedTokenAccount(conn, payer, mint, depositor.publicKey, OPTS);
  await mintTo(conn, payer, mint, depositorAta, payer, 1_000_000_000n, [], OPTS);
  ids = vaultIds(PROGRAM, mint.toBase58());
  await program.methods
    .initVault("NVDAx")
    .accountsPartial({ payer: payer.publicKey, mint, vault: pk(ids.vault), vaultTokens: pk(ids.vaultTokens), tokenProgram: TOKEN_PROGRAM_ID })
    .rpc(OPTS);
  await open(VICTIM, VICTIM_UNITS);
});

describe("nectar_vault happy paths", () => {
  test("client discriminators equal the IDL", () => {
    for (const i of idl.instructions) assert.deepEqual(i.discriminator, [...DISCRIMINATOR[i.name as keyof typeof DISCRIMINATOR]], i.name);
    for (const a of idl.accounts) assert.deepEqual(a.discriminator, [...ACCOUNT_DISCRIMINATOR[a.name as keyof typeof ACCOUNT_DISCRIMINATOR]], a.name);
  });

  test("init_vault + open_position record the vault, authority and depositor (Position v2 bytes)", async () => {
    const v = await program.account.vault.fetch(pk(ids.vault));
    assert.equal(v.symbol, "NVDAx");
    assert.ok(v.mint.equals(mint));
    assert.equal(await balance(pk(ids.vaultTokens)), VICTIM_UNITS);
    const raw = await rawAccount(positionOf(VICTIM));
    assert.ok(raw);
    assert.equal(raw.length, 131);
    const p = parsePosition(raw);
    assert.deepEqual(p.authority, AUTH.pub);
    assert.equal(p.depositor, DEPOSITOR);
    assert.equal(p.amount, VICTIM_UNITS);
    assert.equal(p.status, STATUS_OPEN);
    assert.equal(p.vault, ids.vault);
    assert.equal(p.positionId, VICTIM);
    assert.equal(p.withdrawable, 0n);
    const viaAnchor = await program.account.position.fetch(pk(positionOf(VICTIM)));
    assert.equal(viaAnchor.bump, p.bump);
    assert.equal(viaAnchor.withdrawable.toString(), "0");
  });

  test("settle kind 0: v1 demo_leg vector rebuilt on-chain; seize to recipient ATA, remainder pulled with withdraw", async () => {
    const units = 100_000_000n;
    await open(DEMO_LEG.positionId, units);
    const args: SettleArgs = { ...DEMO_LEG, expires: future(), kind: KIND_LEGACY };
    const msg = settleMessage(args);
    // Only `program=` and `expires=` differ from the vector's preimage.
    assert.match(Buffer.from(msg).toString(), /^NECTAR_SETTLE_V1\|chain=solana-devnet\|program=\w+\|pos=0\|quote=0\|repay_e6=10000000000\|seize_units=57544379\|recipient=3DTxgHcUXRb9uvpKwtasZN7YBUbbPuf3uvbBPjAGWqiV\|nonce=0\|expires=\d+$/);
    const before = await balance(depositorAta);
    const ixs = signedSettle(args);
    const sig = await send(ixs);
    const recipientAta = getAssociatedTokenAddressSync(mint, pk(DEMO_LEG.recipient), true);
    assert.equal(await balance(recipientAta), DEMO_LEG.seizeUnits);
    assert.equal(await balance(depositorAta), before, "settle moves nothing to the depositor");
    const p = await readPosition(0n);
    assert.equal(p.status, STATUS_SETTLED);
    assert.equal(p.withdrawable, units - DEMO_LEG.seizeUnits);
    assert.equal(await rawAccount(claimOf(DEMO_LEG.recipient)), null, "no claim on the direct path");
    await withdraw(0n, depositor, depositorAta);
    assert.equal((await balance(depositorAta)) - before, units - DEMO_LEG.seizeUnits);
    assert.equal(await rawAccount(positionOf(0n)), null, "position closed on withdraw");
    const raw = await rawAccount(nonceOf(0n, 0n));
    assert.ok(raw);
    assert.equal(raw.length, 91);
    const n = parseNonceRecord(raw);
    assert.deepEqual(
      { version: n.version, vault: n.vault, nonce: n.nonce, positionId: n.positionId, op: n.op, kind: n.kind },
      { version: 2, vault: ids.vault, nonce: 0n, positionId: 0n, op: OP_SETTLE, kind: KIND_LEGACY },
    );
    assert.deepEqual(n.authority, AUTH.pub);
    const tx = await conn.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    console.log(`# settle kind 0 (creates ATA): ${tx?.meta?.computeUnitsConsumed} CU, msg ${msg.length} bytes`);
  });

  test("worst-case settle transaction fits in 1232 bytes", () => {
    const max = (1n << 64n) - 1n;
    const args: SettleArgs = { positionId: max, quoteId: max, repayE6: max, seizeUnits: max, recipient: buyer, nonce: max, expires: (1n << 63n) - 1n, kind: KIND_PRELIQ };
    const t = new Transaction().add(...signedSettle(args));
    t.recentBlockhash = PublicKey.default.toBase58();
    t.feePayer = payer.publicKey;
    const size = t.serialize({ requireAllSignatures: false, verifySignatures: false }).length;
    console.log(`# settle worst case: ${size} of 1232 bytes`);
    assert.ok(size <= 1232, `transaction is ${size} bytes`);
  });

  test("settle kind 1 (PRELIQ): seize everything, withdraw only closes the slot", async () => {
    await open(1n, 30_000_000n);
    const args: SettleArgs = { positionId: 1n, quoteId: 5n, repayE6: 2_500_000n, seizeUnits: 30_000_000n, recipient: buyer, nonce: 1n, expires: future(), kind: KIND_PRELIQ };
    assert.ok(Buffer.from(settleMessage(args)).toString().endsWith("|kind=PRELIQ"));
    await send(signedSettle(args));
    assert.equal(await balance(getAssociatedTokenAddressSync(mint, pk(buyer), true)), 30_000_000n);
    assert.equal((await readPosition(1n)).withdrawable, 0n);
    const before = await balance(depositorAta);
    await withdraw(1n, depositor, depositorAta);
    assert.equal(await balance(depositorAta), before);
    assert.equal(await rawAccount(positionOf(1n)), null);
  });

  test("settle kind 2 (SELF) with recipient = depositor", async () => {
    await open(3n, 7_000_000n);
    const before = await balance(depositorAta);
    const args: SettleArgs = { positionId: 3n, quoteId: 6n, repayE6: 1n, seizeUnits: 4_000_000n, recipient: DEPOSITOR, nonce: 3n, expires: future(), kind: KIND_SELF };
    await send(signedSettle(args));
    assert.equal((await balance(depositorAta)) - before, 4_000_000n);
    await withdraw(3n, depositor, depositorAta);
    assert.equal((await balance(depositorAta)) - before, 7_000_000n);
  });

  test("release records the whole amount; withdraw pays any token account of the mint", async () => {
    await open(2n, 12_345_678n);
    const vaultBefore = await balance(pk(ids.vaultTokens));
    const sig = await send(signedRelease(2n, 2n));
    assert.equal(await balance(pk(ids.vaultTokens)), vaultBefore, "release moves no tokens");
    const p = await readPosition(2n);
    assert.equal(p.status, STATUS_RELEASED);
    assert.equal(p.withdrawable, 12_345_678n);
    const raw = await rawAccount(nonceOf(2n, 2n));
    assert.ok(raw);
    assert.equal(parseNonceRecord(raw).op, OP_RELEASE);
    const elsewhere = await anyTokenAccount(Keypair.generate().publicKey);
    await withdraw(2n, depositor, elsewhere);
    assert.equal(await balance(elsewhere), 12_345_678n);
    assert.equal(await rawAccount(positionOf(2n)), null);
    const tx = await conn.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    console.log(`# release: ${tx?.meta?.computeUnitsConsumed} CU`);
  });
});

describe("SR-1 slot-scoped nonces", () => {
  test("nonces burnt on the attacker's own slots, same ids, do not block an honest settle or release", async () => {
    const attacker = await holder(10n);
    const [N, M] = [5000n, 5001n];
    await open(710n, 1n, attacker, K_ATTACKER.pub);
    const burn: SettleArgs = { positionId: 710n, quoteId: 1n, repayE6: 1n, seizeUnits: 1n, recipient: attacker.key, nonce: N, expires: future(), kind: KIND_PRELIQ };
    await send(signedSettle(burn, attacker.key, K_ATTACKER));
    await open(711n, 1n, attacker, K_ATTACKER.pub);
    await send(signedRelease(711n, M, attacker.key, K_ATTACKER));
    assert.ok(await rawAccount(nonceOf(N, 710n, attacker.key, K_ATTACKER.pub)), "burnt on the attacker's slot");
    assert.ok(await rawAccount(nonceOf(M, 711n, attacker.key, K_ATTACKER.pub)), "burnt on the attacker's slot");
    assert.equal(await rawAccount(nonceOf(N, 710n)), null, "still unused on the honest slot");
    assert.equal(await rawAccount(nonceOf(M, 711n)), null, "still unused on the honest slot");

    await open(710n, 2_000_000n);
    await send(signedSettle({ positionId: 710n, quoteId: 2n, repayE6: 5n, seizeUnits: 500_000n, recipient: buyer, nonce: N, expires: future(), kind: KIND_PRELIQ }));
    assert.equal((await readPosition(710n)).status, STATUS_SETTLED);
    await open(711n, 3_000_000n);
    await send(signedRelease(711n, M));
    assert.equal((await readPosition(711n)).status, STATUS_RELEASED);
  });

  test("a nonce record derived from another slot is refused", async () => {
    const args = victimSettle({ nonce: 1020n });
    const ix = settleIx(args);
    ix.accounts[8] = { ...ix.accounts[8]!, address: nonceOf(1020n, 901n) as (typeof ix.accounts)[number]["address"] };
    await expectFail(send([verifyIx(AUTH, settleMessage(args)), toIx(ix)]), "Error Code: ConstraintSeeds");
  });
});

describe("N1 authority-scoped nonces", () => {
  const swapNonce = (ix: VaultInstruction, index: number, a: string): VaultInstruction => {
    ix.accounts[index] = { ...ix.accounts[index]!, address: a as (typeof ix.accounts)[number]["address"] };
    return ix;
  };

  /** The attack: open under a key the depositor controls, consume nonce n, withdraw, repeat at the same address. */
  async function preburn(id: bigint, d: Holder, nonces: bigint[], op: "release" | "settle"): Promise<void> {
    for (const n of nonces) {
      await open(id, 1n, d, K_ATTACKER.pub);
      if (op === "release") await send(signedRelease(id, n, d.key, K_ATTACKER));
      else await send(signedSettle({ positionId: id, quoteId: 1n, repayE6: 1n, seizeUnits: 1n, recipient: d.key, nonce: n, expires: future(), kind: KIND_PRELIQ }, d.key, K_ATTACKER));
      await withdraw(id, d.kp, d.ata);
      assert.ok(await rawAccount(nonceOf(n, id, d.key, K_ATTACKER.pub)), `nonce ${n} burnt under the depositor's own key`);
      assert.equal(await rawAccount(nonceOf(n, id, d.key)), null, `nonce ${n} unused under the real authority`);
    }
  }

  for (const [op, id, base] of [["release", 750n, 5600n], ["settle", 751n, 5610n]] as const) {
    test(`pre-burning nonces by ${op} under the depositor's own key does not block the authority's signatures on the reopened slot`, async () => {
      const full = 6_000_000n;
      const d = await holder(full);
      const [n0, n1, n2] = [base, base + 1n, base + 2n];
      await preburn(id, d, [n0, n1, n2], op);

      const r = Keypair.generate().publicKey.toBase58();
      const leg = (nonce: bigint): SettleArgs => ({ positionId: id, quoteId: 20n, repayE6: 5n, seizeUnits: 1_000_000n, recipient: r, nonce, expires: future(), kind: KIND_PRELIQ });
      await open(id, full, d);
      await send(signedSettle(leg(n0), d.key));
      assert.equal(await balance(getAssociatedTokenAddressSync(mint, pk(r), true)), 1_000_000n);
      const s = await readPosition(id, d.key);
      assert.equal(s.status, STATUS_SETTLED);
      assert.equal(s.withdrawable, full - 1_000_000n);
      const settled = await rawAccount(nonceOf(n0, id, d.key));
      assert.ok(settled);
      assert.equal(parseNonceRecord(settled).op, OP_SETTLE);
      assert.deepEqual(parseNonceRecord(settled).authority, AUTH.pub);
      await withdraw(id, d.kp, d.ata);

      await open(id, full - 1_000_000n, d);
      await send(signedRelease(id, n1, d.key));
      const p = await readPosition(id, d.key);
      assert.equal(p.status, STATUS_RELEASED);
      assert.equal(p.withdrawable, full - 1_000_000n);
      const released = await rawAccount(nonceOf(n1, id, d.key));
      assert.ok(released);
      assert.equal(parseNonceRecord(released).op, OP_RELEASE);
      assert.deepEqual(parseNonceRecord(released).authority, AUTH.pub);
      await withdraw(id, d.kp, d.ata);

      // Under the real authority the replay set still holds across a reopen.
      await open(id, 1_000n, d);
      await expectFail(send(signedSettle(leg(n0), d.key)), "already in use");
      await expectFail(send(signedRelease(id, n1, d.key)), "already in use");
      await send(signedRelease(id, n2, d.key));
      assert.equal((await readPosition(id, d.key)).status, STATUS_RELEASED);
    });
  }

  test("a nonce record derived under another authority, or at the pre-N1 seeds, is refused", async () => {
    const args = victimSettle({ nonce: 1022n });
    const verify = verifyIx(AUTH, settleMessage(args));
    await expectFail(send([verify, toIx(settleIx(args, DEPOSITOR, ids, OTHER.pub))]), "Error Code: ConstraintSeeds");
    const old = findProgramAddress([utf8("nonce"), keyBytes(positionOf(VICTIM)), u64le(1022n)], PROGRAM).address;
    await expectFail(send([verify, toIx(swapNonce(settleIx(args), 8, old))]), "Error Code: ConstraintSeeds");

    const expires = future();
    const verifyRelease = verifyIx(AUTH, releaseMessage(VICTIM, 1023n, expires));
    await expectFail(send([verifyRelease, toIx(releaseIx(VICTIM, 1023n, expires, DEPOSITOR, OTHER.pub))]), "Error Code: ConstraintSeeds");
    const oldRelease = findProgramAddress([utf8("nonce"), keyBytes(positionOf(VICTIM)), u64le(1023n)], PROGRAM).address;
    await expectFail(send([verifyRelease, toIx(swapNonce(releaseIx(VICTIM, 1023n, expires), 3, oldRelease))]), "Error Code: ConstraintSeeds");
  });
});

describe("SR-4 pull payouts", () => {
  test("depositor reassigns its ATA owner: settle still pays the recipient, withdraw goes elsewhere", async () => {
    const d = await holder(9_000_000n);
    await open(720n, 9_000_000n, d);
    await setAuthority(conn, payer, d.ata, d.kp, AuthorityType.AccountOwner, Keypair.generate().publicKey, [], OPTS);
    const r = Keypair.generate().publicKey.toBase58();
    await send(signedSettle({ positionId: 720n, quoteId: 3n, repayE6: 5n, seizeUnits: 4_000_000n, recipient: r, nonce: 5100n, expires: future(), kind: KIND_PRELIQ }, d.key));
    assert.equal(await balance(getAssociatedTokenAddressSync(mint, pk(r), true)), 4_000_000n);
    const elsewhere = await anyTokenAccount(d.kp.publicKey);
    await withdraw(720n, d.kp, elsewhere);
    assert.equal(await balance(elsewhere), 5_000_000n);
    assert.equal(await rawAccount(positionOf(720n, d.key)), null);
  });

  test("depositor reassigns its ATA owner: release and withdraw still work", async () => {
    const d = await holder(1_000_000n);
    await open(721n, 1_000_000n, d);
    await setAuthority(conn, payer, d.ata, d.kp, AuthorityType.AccountOwner, Keypair.generate().publicKey, [], OPTS);
    await send(signedRelease(721n, 5101n, d.key));
    const elsewhere = await anyTokenAccount(d.kp.publicKey);
    await withdraw(721n, d.kp, elsewhere);
    assert.equal(await balance(elsewhere), 1_000_000n);
  });

  test("recipient ATA reassigned: settle credits a claim, recipient and depositor both pull", async () => {
    const r = Keypair.generate();
    const R = r.publicKey.toBase58();
    const ata = await createAssociatedTokenAccount(conn, payer, mint, r.publicKey, OPTS);
    await setAuthority(conn, payer, ata, r, AuthorityType.AccountOwner, Keypair.generate().publicKey, [], OPTS);
    await open(730n, 8_000_000n);
    const sig = await send(signedSettle({ positionId: 730n, quoteId: 4n, repayE6: 5n, seizeUnits: 6_000_000n, recipient: R, nonce: 5200n, expires: future(), kind: KIND_PRELIQ }));
    assert.equal(await balance(ata), 0n);
    const raw = await rawAccount(claimOf(R));
    assert.ok(raw);
    assert.equal(raw.length, 82);
    const c = parseClaim(raw);
    assert.deepEqual({ vault: c.vault, recipient: c.recipient, amount: c.amount }, { vault: ids.vault, recipient: R, amount: 6_000_000n });
    const tx = await conn.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    console.log(`# settle claim path: ${tx?.meta?.computeUnitsConsumed} CU`);

    const dest = await anyTokenAccount(Keypair.generate().publicKey);
    await send([toIx(claimInstruction(ids, R, dest.toBase58()))], [r]);
    assert.equal(await balance(dest), 6_000_000n);
    assert.equal(await rawAccount(claimOf(R)), null, "claim closed");
    await expectFail(send([toIx(claimInstruction(ids, R, dest.toBase58()))], [r]), "AccountNotInitialized");

    const before = await balance(depositorAta);
    await withdraw(730n, depositor, depositorAta);
    assert.equal((await balance(depositorAta)) - before, 2_000_000n);
  });

  test("recipient ATA frozen: credits accumulate on one claim across settles", async () => {
    const r = Keypair.generate();
    const R = r.publicKey.toBase58();
    const ata = await createAssociatedTokenAccount(conn, payer, mint, r.publicKey, OPTS);
    await freezeAccount(conn, payer, ata, mint, payer, [], OPTS);
    await open(731n, 1_000_000n);
    await open(732n, 2_000_000n);
    await send(signedSettle({ positionId: 731n, quoteId: 5n, repayE6: 5n, seizeUnits: 1_000_000n, recipient: R, nonce: 5201n, expires: future(), kind: KIND_PRELIQ }));
    await send(signedSettle({ positionId: 732n, quoteId: 6n, repayE6: 5n, seizeUnits: 2_000_000n, recipient: R, nonce: 5202n, expires: future(), kind: KIND_PRELIQ }));
    const raw = await rawAccount(claimOf(R));
    assert.ok(raw);
    assert.equal(parseClaim(raw).amount, 3_000_000n);
    const dest = await anyTokenAccount(r.publicKey);
    await send([toIx(claimInstruction(ids, R, dest.toBase58()))], [r]);
    assert.equal(await balance(dest), 3_000_000n);
  });

  test("pre-funding the claim, nonce or ATA address blocks nothing", async () => {
    const r = Keypair.generate();
    const R = r.publicKey.toBase58();
    const ata = await createAssociatedTokenAccount(conn, payer, mint, r.publicKey, OPTS);
    await setAuthority(conn, payer, ata, r, AuthorityType.AccountOwner, Keypair.generate().publicKey, [], OPTS);
    const fresh = Keypair.generate().publicKey.toBase58();
    const donate = (to: PublicKey): TransactionInstruction => SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: to, lamports: 1_000_000 });
    await send([donate(pk(claimOf(R))), donate(pk(nonceOf(5203n, 733n))), donate(pk(nonceOf(5204n, 734n))), donate(getAssociatedTokenAddressSync(mint, pk(fresh), true))]);
    await open(733n, 1_000_000n);
    await open(734n, 1_000_000n);
    await send(signedSettle({ positionId: 733n, quoteId: 7n, repayE6: 5n, seizeUnits: 1_000_000n, recipient: R, nonce: 5203n, expires: future(), kind: KIND_PRELIQ }));
    const raw = await rawAccount(claimOf(R));
    assert.ok(raw);
    assert.equal(parseClaim(raw).amount, 1_000_000n);
    await send(signedSettle({ positionId: 734n, quoteId: 8n, repayE6: 5n, seizeUnits: 1_000_000n, recipient: fresh, nonce: 5204n, expires: future(), kind: KIND_PRELIQ }));
    assert.equal(await balance(getAssociatedTokenAddressSync(mint, pk(fresh), true)), 1_000_000n);
  });

  test("Token-2022 recipient with required memos: settle credits a claim; open and withdraw work on Token-2022", async () => {
    const m = await createMint(conn, payer, payer.publicKey, null, 6, undefined, OPTS, TOKEN_2022_PROGRAM_ID);
    const v = vaultIds(PROGRAM, m.toBase58(), TOKEN_2022_PROGRAM_ID.toBase58());
    await program.methods
      .initVault("T22")
      .accountsPartial({ payer: payer.publicKey, mint: m, vault: pk(v.vault), vaultTokens: pk(v.vaultTokens), tokenProgram: TOKEN_2022_PROGRAM_ID })
      .rpc(OPTS);
    const dAta = await createAssociatedTokenAccount(conn, payer, m, depositor.publicKey, OPTS, TOKEN_2022_PROGRAM_ID);
    await mintTo(conn, payer, m, dAta, payer, 5_000_000n, [], OPTS, TOKEN_2022_PROGRAM_ID);
    await send([toIx(openPositionInstruction(v, DEPOSITOR, dAta.toBase58(), { positionId: 740n, authority: AUTH.pub, amount: 5_000_000n }))], [depositor]);

    const r = Keypair.generate();
    const R = r.publicKey.toBase58();
    const rAta = await createAssociatedTokenAccount(conn, payer, m, r.publicKey, OPTS, TOKEN_2022_PROGRAM_ID);
    await send(
      [
        createReallocateInstruction(rAta, payer.publicKey, [ExtensionType.MemoTransfer], r.publicKey, [], TOKEN_2022_PROGRAM_ID),
        createEnableRequiredMemoTransfersInstruction(rAta, r.publicKey, [], TOKEN_2022_PROGRAM_ID),
      ],
      [r],
    );
    await send(signedSettle({ positionId: 740n, quoteId: 9n, repayE6: 5n, seizeUnits: 3_000_000n, recipient: R, nonce: 5300n, expires: future(), kind: KIND_PRELIQ }, DEPOSITOR, AUTH, v));
    assert.equal(await balance22(rAta), 0n);
    const raw = await rawAccount(claimOf(R, v));
    assert.ok(raw);
    assert.equal(parseClaim(raw).amount, 3_000_000n);

    await send([toIx(withdrawInstruction(v, DEPOSITOR, 740n, dAta.toBase58()))], [depositor]);
    assert.equal(await balance22(dAta), 2_000_000n);
    const dest = await createAccount(conn, payer, m, r.publicKey, Keypair.generate(), OPTS, TOKEN_2022_PROGRAM_ID);
    await send([toIx(claimInstruction(v, R, dest.toBase58()))], [r]);
    assert.equal(await balance22(dest), 3_000_000n);
  });

  test("a relayer cannot force the claim path", async () => {
    const args = victimSettle({ nonce: 1021n });
    const replace = (index: number, a: string): VaultInstruction => {
      const ix = settleIx(args);
      ix.accounts[index] = { ...ix.accounts[index]!, address: a as (typeof ix.accounts)[number]["address"] };
      return ix;
    };
    const verify = verifyIx(AUTH, settleMessage(args));
    await expectFail(send([verify, toIx(replace(6, depositorAta.toBase58()))]), "Error Code: RecipientTokensMismatch");
    await expectFail(send([verify, toIx(replace(7, Keypair.generate().publicKey.toBase58()))]), "Error Code: ConstraintSeeds");
    await expectFail(send([verify, toIx(settleIx(args, DEPOSITOR, { ...ids, tokenProgram: TOKEN_2022_PROGRAM_ID.toBase58() }))]), "Error Code: ConstraintMintTokenProgram");
  });

  test("withdraw and claim negatives", async () => {
    const stranger = await holder(1n);
    await expectFail(withdraw(VICTIM, depositor, depositorAta), "Error Code: PositionStillOpen");
    await open(735n, 1_000_000n);
    await send(signedRelease(735n, 5205n));
    await expectFail(withdraw(735n, depositor, pk(ids.vaultTokens)), "Error Code: DestinationIsVault");
    const otherMint = await createMint(conn, payer, payer.publicKey, null, 6, undefined, OPTS);
    const wrong = await createAssociatedTokenAccount(conn, payer, otherMint, depositor.publicKey, OPTS);
    await expectFail(withdraw(735n, depositor, wrong), "Error Code: ConstraintTokenMint");
    const stolen = withdrawInstruction(ids, stranger.key, 735n, stranger.ata.toBase58());
    stolen.accounts[4] = { ...stolen.accounts[4]!, address: positionOf(735n) as (typeof stolen.accounts)[number]["address"] };
    await expectFail(send([toIx(stolen)], [stranger.kp]), "Error Code: ConstraintSeeds");
    await withdraw(735n, depositor, depositorAta);
    await expectFail(withdraw(735n, depositor, depositorAta), "AccountNotInitialized");

    const r = Keypair.generate();
    const R = r.publicKey.toBase58();
    const ata = await createAssociatedTokenAccount(conn, payer, mint, r.publicKey, OPTS);
    await freezeAccount(conn, payer, ata, mint, payer, [], OPTS);
    await open(736n, 1_000_000n);
    await send(signedSettle({ positionId: 736n, quoteId: 10n, repayE6: 5n, seizeUnits: 1_000_000n, recipient: R, nonce: 5206n, expires: future(), kind: KIND_PRELIQ }));
    const taken = claimInstruction(ids, stranger.key, stranger.ata.toBase58());
    taken.accounts[4] = { ...taken.accounts[4]!, address: claimOf(R) as (typeof taken.accounts)[number]["address"] };
    await expectFail(send([toIx(taken)], [stranger.kp]), "Error Code: ConstraintSeeds");
    await expectFail(send([toIx(claimInstruction(ids, R, ids.vaultTokens))], [r]), "Error Code: DestinationIsVault");
  });
});

describe("SR-8 depositor-bound slots", () => {
  test("an attacker opening the same id with another depositor does not block the honest depositor", async () => {
    const attacker = await holder(5n);
    await open(800n, 1n, attacker, K_ATTACKER.pub);
    assert.notEqual(positionOf(800n, attacker.key), positionOf(800n));
    await open(800n, 4_000_000n);
    const honest = await readPosition(800n);
    assert.equal(honest.depositor, DEPOSITOR);
    assert.deepEqual(honest.authority, AUTH.pub);
    await send(signedSettle({ positionId: 800n, quoteId: 11n, repayE6: 5n, seizeUnits: 1_000_000n, recipient: buyer, nonce: 5400n, expires: future(), kind: KIND_PRELIQ }));
    assert.equal((await readPosition(800n)).withdrawable, 3_000_000n);
    assert.equal((await readPosition(800n, attacker.key)).status, STATUS_OPEN, "the attacker's slot is separate");
  });

  test("the same id and authority under another depositor: a release signature cannot cross slots", async () => {
    const attacker = await holder(5n);
    await open(801n, 1n, attacker);
    await open(801n, 1_000_000n);
    const expires = future();
    await expectFail(
      send([verifyIx(AUTH, releaseMessage(801n, 5401n, expires)), toIx(releaseIx(801n, 5401n, expires, attacker.key))]),
      "Error Code: MessageMismatch",
    );
    await send(signedRelease(801n, 5401n));
    assert.equal((await readPosition(801n)).status, STATUS_RELEASED);
  });

  test("the depositor is bound: a slot opened by one wallet cannot be opened again by it", async () => {
    await expectFail(open(VICTIM, 1n), "already in use");
  });

  test("an attacker relaying NEAR's settle signature on its own same-authority slot does not burn the honest slot's nonce", async () => {
    const attacker = await holder(1_000_000n);
    await open(802n, 1_000_000n, attacker);
    await open(802n, 5_000_000n);
    const r = Keypair.generate().publicKey.toBase58();
    const rAta = getAssociatedTokenAddressSync(mint, pk(r), true);
    const args: SettleArgs = { positionId: 802n, quoteId: 12n, repayE6: 5n, seizeUnits: 1_000_000n, recipient: r, nonce: 5402n, expires: future(), kind: KIND_PRELIQ };
    await send(signedSettle(args, attacker.key));
    assert.equal(await balance(rAta), 1_000_000n, "only the attacker's own units moved");
    assert.ok(await rawAccount(nonceOf(5402n, 802n, attacker.key)), "consumed on the attacker's slot");
    assert.equal(await rawAccount(nonceOf(5402n, 802n)), null, "unused on the honest slot");
    assert.equal((await readPosition(802n)).status, STATUS_OPEN);

    await send(signedSettle(args)); // the same signed message, the same nonce
    assert.equal(await balance(rAta), 2_000_000n);
    const honest = await readPosition(802n);
    assert.equal(honest.status, STATUS_SETTLED);
    assert.equal(honest.withdrawable, 4_000_000n);
    const raw = await rawAccount(nonceOf(5402n, 802n));
    assert.ok(raw);
    assert.equal(parseNonceRecord(raw).op, OP_SETTLE);
    await expectFail(send(signedSettle(args)), "already in use");
  });
});

describe("nectar_vault negative paths", () => {
  test("wrong message: signed seize_units differs from the instruction args", async () => {
    const args = victimSettle();
    const signed = settleMessage({ ...args, seizeUnits: args.seizeUnits + 1n });
    await expectFail(send([verifyIx(AUTH, signed), toIx(settleIx(args))]), "Error Code: MessageMismatch");
  });

  test("missing verify instruction", async () => {
    await expectFail(send([toIx(settleIx(victimSettle()))]), "Error Code: MissingEd25519Verify");
  });

  test("verify instruction not immediately preceding settle", async () => {
    const args = victimSettle();
    const ixs = [verifyIx(AUTH, settleMessage(args)), ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), toIx(settleIx(args))];
    await expectFail(send(ixs), "Error Code: MissingEd25519Verify");
  });

  test("wrong authority: valid signature by another key", async () => {
    const args = victimSettle();
    await expectFail(send([verifyIx(OTHER, settleMessage(args)), toIx(settleIx(args))]), "Error Code: PubkeyMismatch");
  });

  test("replayed settle on a withdrawn slot: the position is closed", async () => {
    const replay: SettleArgs = { ...DEMO_LEG, expires: future(), kind: KIND_LEGACY };
    await expectFail(send(signedSettle(replay)), "AccountNotInitialized");
  });

  test("a settled, not yet withdrawn position cannot be settled or released again", async () => {
    await open(900n, 1_000_000n);
    await send(signedSettle({ positionId: 900n, quoteId: 13n, repayE6: 5n, seizeUnits: 1n, recipient: buyer, nonce: 5500n, expires: future(), kind: KIND_PRELIQ }));
    await expectFail(
      send(signedSettle({ positionId: 900n, quoteId: 13n, repayE6: 5n, seizeUnits: 1n, recipient: buyer, nonce: 5501n, expires: future(), kind: KIND_PRELIQ })),
      "Error Code: PositionNotOpen",
    );
    await expectFail(send(signedRelease(900n, 5502n)), "Error Code: PositionNotOpen");
  });

  test("expired", async () => {
    const args = victimSettle({ expires: BigInt(Math.floor(Date.now() / 1000) - 120) });
    await expectFail(send(signedSettle(args)), "Error Code: Expired");
  });

  test("expired release", async () => {
    const expires = BigInt(Math.floor(Date.now() / 1000) - 120);
    await expectFail(send([verifyIx(AUTH, releaseMessage(VICTIM, 1009n, expires)), toIx(releaseIx(VICTIM, 1009n, expires))]), "Error Code: Expired");
  });

  test("release presented with a settlement signature", async () => {
    const expires = future();
    const settleMsg = settleMessage(victimSettle({ nonce: 1001n, expires }));
    await expectFail(send([verifyIx(AUTH, settleMsg), toIx(releaseIx(VICTIM, 1001n, expires))]), "Error Code: MessageMismatch");
  });

  test("replayed release on a withdrawn slot: the position is closed", async () => {
    await expectFail(send(signedRelease(2n, 2n)), "AccountNotInitialized");
  });

  test("a closed and reopened slot cannot replay a used nonce, by settle or by release", async () => {
    // Slots 0 and 2 were settled / released and withdrawn above; reopening lands on the same PDAs.
    await open(DEMO_LEG.positionId, 100_000_000n);
    const replay: SettleArgs = { ...DEMO_LEG, expires: future(), kind: KIND_LEGACY };
    await expectFail(send(signedSettle(replay)), "already in use");
    await expectFail(send(signedRelease(DEMO_LEG.positionId, DEMO_LEG.nonce)), "already in use");
    await open(2n, 1_000_000n);
    await expectFail(send(signedRelease(2n, 2n)), "already in use");
    await expectFail(send(signedSettle({ positionId: 2n, quoteId: 1n, repayE6: 1n, seizeUnits: 1n, recipient: buyer, nonce: 2n, expires: future(), kind: KIND_PRELIQ })), "already in use");
    assert.equal((await readPosition(DEMO_LEG.positionId)).status, STATUS_OPEN);
    assert.equal((await readPosition(2n)).status, STATUS_OPEN);
    // A fresh nonce on the reopened slot still works.
    await send(signedRelease(2n, 3n));
    assert.equal((await readPosition(2n)).status, STATUS_RELEASED);
  });

  test("release without a verify instruction, and by the wrong key", async () => {
    const expires = future();
    await expectFail(send([toIx(releaseIx(VICTIM, 1010n, expires))]), "Error Code: MissingEd25519Verify");
    await expectFail(send([verifyIx(OTHER, releaseMessage(VICTIM, 1010n, expires)), toIx(releaseIx(VICTIM, 1010n, expires))]), "Error Code: PubkeyMismatch");
  });

  test("settle presented with a release signature", async () => {
    const args = victimSettle({ nonce: 1002n });
    const relMsg = releaseMessage(VICTIM, 1002n, args.expires);
    await expectFail(send([verifyIx(AUTH, relMsg), toIx(settleIx(args))]), "Error Code: MessageMismatch");
  });

  test("kind mismatch: a kind 1 signature presented as kind 0", async () => {
    const args = victimSettle({ kind: KIND_PRELIQ, nonce: 1003n });
    await expectFail(send([verifyIx(AUTH, settleMessage(args)), toIx(settleIx({ ...args, kind: KIND_LEGACY }))]), "Error Code: MessageMismatch");
  });

  test("unknown kind 3", async () => {
    const args = victimSettle({ nonce: 1004n });
    await expectFail(send([verifyIx(AUTH, settleMessage(args)), toIx(settleIx({ ...args, kind: 3 }))]), "Error Code: InvalidKind");
  });

  test("tampered signature: the Ed25519 program itself rejects the transaction", async () => {
    const args = victimSettle({ nonce: 1005n });
    const msg = settleMessage(args);
    const bad = AUTH.sign(msg);
    bad[0] ^= 1;
    await expectFail(send([verifyIx(AUTH, msg, bad), toIx(settleIx(args))]), "Error processing Instruction 0");
  });

  test("verify instruction whose message offset points at another instruction index", async () => {
    const args = victimSettle({ nonce: 1006n });
    const msg = settleMessage(args);
    const data = ed25519InstructionData(AUTH.pub, AUTH.sign(msg), msg);
    new DataView(data.buffer).setUint16(14, 0, true); // message_instruction_index = 0 (the verify ix itself, still valid for the precompile)
    const ix = new TransactionInstruction({ programId: pk(ED25519_PROGRAM_ADDRESS), keys: [], data: Buffer.from(data) });
    await expectFail(send([ix, toIx(settleIx(args))]), "Error Code: BadEd25519Layout");
  });

  test("seize_units above the position amount", async () => {
    const args = victimSettle({ seizeUnits: VICTIM_UNITS + 1n, nonce: 1007n });
    await expectFail(send(signedSettle(args)), "Error Code: SeizeExceedsAmount");
  });

  test("recipient account differs from the signed recipient", async () => {
    const args = victimSettle({ nonce: 1008n });
    const ix = settleIx(args);
    ix.accounts[5] = { ...ix.accounts[5]!, address: Keypair.generate().publicKey.toBase58() as (typeof ix.accounts)[number]["address"] };
    await expectFail(send([verifyIx(AUTH, settleMessage(args)), toIx(ix)]), "Error Code: RecipientMismatch");
  });

  test("position PDA of another id", async () => {
    const args = victimSettle({ nonce: 1011n, positionId: 901n });
    const ix = settleIx(args);
    ix.accounts[4] = { ...ix.accounts[4]!, address: positionOf(VICTIM) as (typeof ix.accounts)[number]["address"] };
    await expectFail(send([verifyIx(AUTH, settleMessage(args)), toIx(ix)]), "Error Code: ConstraintSeeds");
  });

  test("victim position is untouched after every rejected attempt", async () => {
    const p = await readPosition(VICTIM);
    assert.equal(p.amount, VICTIM_UNITS);
    assert.equal(p.status, STATUS_OPEN);
    assert.equal(p.withdrawable, 0n);
    for (const n of [1000n, 1001n, 1002n, 1003n, 1004n, 1005n, 1006n, 1007n, 1008n, 1009n, 1010n, 1011n, 1020n, 1021n, 1022n, 1023n]) {
      assert.equal(await rawAccount(nonceOf(n, VICTIM)), null, `nonce ${n} unused`);
    }
  });
});
