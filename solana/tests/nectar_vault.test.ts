// nectar_vault on solana-test-validator (`anchor test`). A local Ed25519 key (the v1 vector test seed 0x07..07)
// stands in for the NEAR MPC-derived authority. Devnet uses the authority NEAR derives per position (TODO-G7).
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import anchor from "@coral-xyz/anchor";
import type { Program } from "@coral-xyz/anchor";
import {
  ComputeBudgetProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import idl from "../target/idl/nectar_vault.json" with { type: "json" };
import type { NectarVault } from "../target/types/nectar_vault.ts";
import { ED25519_PROGRAM_ADDRESS, ed25519InstructionData, hexToBytes } from "../client/ed25519.ts";
import { KIND_LEGACY, KIND_PRELIQ, KIND_SELF, releasePreimage, settlePreimage, utf8 } from "../client/preimage.ts";
import type { SettleKind } from "../client/preimage.ts";
import { edKey, errText } from "./helpers.ts";
import type { EdKey } from "./helpers.ts";

const { AnchorProvider, BN } = anchor;
const provider = AnchorProvider.env();
anchor.setProvider(provider);
const program = new anchor.Program<NectarVault>(idl as NectarVault, provider);
const conn = provider.connection;
const payer = (provider.wallet as unknown as { payer: Keypair }).payer;
const PROGRAM_ID = program.programId;

// v1 vector `demo_leg` (contracts/nectar-core/tests/preimage_vectors.json): same fields except program (this deploy)
// and expires (future); signed by the same test key.
const VECTOR_SEED = "0707070707070707070707070707070707070707070707070707070707070707";
const DEMO_LEG = {
  positionId: 0n,
  quoteId: 0n,
  repayE6: 10_000_000_000n,
  seizeUnits: 57_544_379n,
  recipient: new PublicKey("3DTxgHcUXRb9uvpKwtasZN7YBUbbPuf3uvbBPjAGWqiV"),
  nonce: 0n,
};

const AUTH: EdKey = edKey(hexToBytes(VECTOR_SEED));
const OTHER: EdKey = edKey(new Uint8Array(32).fill(0x42));
const depositor = Keypair.generate();
const buyer = Keypair.generate().publicKey;
let mint: PublicKey;
let vault: PublicKey;
let vaultTokens: PublicKey;
let depositorAta: PublicKey;

const u64le = (n: bigint): Buffer => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
};
const pda = (...seeds: Buffer[]): PublicKey => PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
const positionPda = (id: bigint): PublicKey => pda(Buffer.from("pos"), vault.toBuffer(), u64le(id));
const noncePda = (n: bigint): PublicKey => pda(Buffer.from("nonce"), vault.toBuffer(), u64le(n));
const future = (): bigint => BigInt(Math.floor(Date.now() / 1000) + 3600);
const bn = (n: bigint): InstanceType<typeof BN> => new BN(n.toString());

function verifyIx(key: EdKey, message: Uint8Array, signature?: Uint8Array): TransactionInstruction {
  const data = ed25519InstructionData(key.pub, signature ?? key.sign(message), message);
  return new TransactionInstruction({ programId: new PublicKey(ED25519_PROGRAM_ADDRESS), keys: [], data: Buffer.from(data) });
}

async function send(ixs: TransactionInstruction[], signers: Keypair[] = []): Promise<string> {
  return provider.sendAndConfirm(new Transaction().add(...ixs), signers, { commitment: "confirmed" });
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

async function balance(ata: PublicKey): Promise<bigint> {
  return (await getAccount(conn, ata, "confirmed")).amount;
}

async function openPosition(id: bigint, amount: bigint, authority: Uint8Array = AUTH.pub): Promise<void> {
  await program.methods
    .openPosition(bn(id), Array.from(authority), bn(amount))
    .accountsPartial({
      depositor: depositor.publicKey,
      vault,
      mint,
      vaultTokens,
      depositorTokens: depositorAta,
      position: positionPda(id),
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([depositor])
    .rpc({ commitment: "confirmed" });
}

interface SettleArgs {
  positionId: bigint;
  quoteId: bigint;
  repayE6: bigint;
  seizeUnits: bigint;
  recipient: PublicKey;
  nonce: bigint;
  expires: bigint;
  kind: SettleKind;
}

function settleMessage(a: SettleArgs): Uint8Array {
  return utf8(settlePreimage({ ...a, program: PROGRAM_ID.toBase58(), recipient: a.recipient.toBase58() }));
}

async function settleIx(a: SettleArgs, kindArg: number = a.kind, recipientAccount: PublicKey = a.recipient): Promise<TransactionInstruction> {
  return program.methods
    .settle(bn(a.positionId), bn(a.quoteId), bn(a.repayE6), bn(a.seizeUnits), a.recipient, bn(a.nonce), bn(a.expires), kindArg)
    .accountsPartial({
      payer: payer.publicKey,
      vault,
      mint,
      vaultTokens,
      position: positionPda(a.positionId),
      depositor: depositor.publicKey,
      depositorTokens: depositorAta,
      recipientAccount,
      recipientTokens: getAssociatedTokenAddressSync(mint, recipientAccount, true),
      nonceRecord: noncePda(a.nonce),
      instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .instruction();
}

function releaseMessage(positionId: bigint, nonce: bigint, expires: bigint): Uint8Array {
  return utf8(
    releasePreimage({ program: PROGRAM_ID.toBase58(), positionId, recipient: depositor.publicKey.toBase58(), nonce, expires }),
  );
}

async function releaseIx(positionId: bigint, nonce: bigint, expires: bigint): Promise<TransactionInstruction> {
  return program.methods
    .release(bn(positionId), bn(nonce), bn(expires))
    .accountsPartial({
      payer: payer.publicKey,
      vault,
      mint,
      vaultTokens,
      position: positionPda(positionId),
      depositor: depositor.publicKey,
      depositorTokens: depositorAta,
      nonceRecord: noncePda(nonce),
      instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .instruction();
}

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
  const sig = await conn.requestAirdrop(depositor.publicKey, 5 * LAMPORTS_PER_SOL);
  await conn.confirmTransaction(sig, "confirmed");
  mint = await createMint(conn, payer, payer.publicKey, null, 6, undefined, { commitment: "confirmed" });
  depositorAta = await createAssociatedTokenAccount(conn, payer, mint, depositor.publicKey, { commitment: "confirmed" });
  await mintTo(conn, payer, mint, depositorAta, payer, 1_000_000_000n, [], { commitment: "confirmed" });
  vault = pda(Buffer.from("vault"), mint.toBuffer());
  vaultTokens = pda(Buffer.from("tokens"), vault.toBuffer());
  await program.methods
    .initVault("NVDAx")
    .accountsPartial({ payer: payer.publicKey, mint, vault, vaultTokens, tokenProgram: TOKEN_PROGRAM_ID })
    .rpc({ commitment: "confirmed" });
  await openPosition(VICTIM, VICTIM_UNITS);
});

describe("nectar_vault happy paths", () => {
  test("init_vault + open_position record the vault, authority and depositor", async () => {
    const v = await program.account.vault.fetch(vault);
    assert.equal(v.symbol, "NVDAx");
    assert.ok(v.mint.equals(mint));
    const p = await program.account.position.fetch(positionPda(VICTIM));
    assert.deepEqual(Uint8Array.from(p.authority), AUTH.pub);
    assert.ok(p.depositor.equals(depositor.publicKey));
    assert.equal(p.amount.toString(), VICTIM_UNITS.toString());
    assert.equal(p.status, 1);
    assert.equal(await balance(vaultTokens), VICTIM_UNITS);
    // Raw layout pinned for the OutLayer vault_read job (deploy.md).
    const raw = (await conn.getAccountInfo(positionPda(VICTIM), "confirmed"))?.data;
    assert.ok(raw);
    assert.equal(raw.length, 123);
    assert.deepEqual(Uint8Array.from(raw.subarray(9, 41)), AUTH.pub);
    assert.ok(new PublicKey(raw.subarray(41, 73)).equals(depositor.publicKey));
    assert.equal(raw.readBigUInt64LE(73), VICTIM_UNITS);
    assert.equal(raw[81], 1);
    assert.ok(new PublicKey(raw.subarray(82, 114)).equals(vault));
    assert.equal(raw.readBigUInt64LE(114), VICTIM);
  });

  test("settle kind 0: v1 demo_leg vector fields rebuilt on-chain; seize to recipient ATA, remainder to depositor", async () => {
    const units = 100_000_000n;
    await openPosition(DEMO_LEG.positionId, units);
    const args: SettleArgs = { ...DEMO_LEG, expires: future(), kind: KIND_LEGACY };
    const msg = settleMessage(args);
    // Only `program=` and `expires=` differ from the vector's preimage.
    assert.match(Buffer.from(msg).toString(), /^NECTAR_SETTLE_V1\|chain=solana-devnet\|program=\w+\|pos=0\|quote=0\|repay_e6=10000000000\|seize_units=57544379\|recipient=3DTxgHcUXRb9uvpKwtasZN7YBUbbPuf3uvbBPjAGWqiV\|nonce=0\|expires=\d+$/);
    const before = await balance(depositorAta);
    const ixs = [verifyIx(AUTH, msg), await settleIx(args)];
    const sig = await send(ixs);
    const recipientAta = getAssociatedTokenAddressSync(mint, DEMO_LEG.recipient, true);
    assert.equal(await balance(recipientAta), DEMO_LEG.seizeUnits);
    assert.equal((await balance(depositorAta)) - before, units - DEMO_LEG.seizeUnits);
    assert.equal(await conn.getAccountInfo(positionPda(0n), "confirmed"), null, "position closed");
    const n = await program.account.nonceRecord.fetch(noncePda(0n));
    assert.equal(n.positionId.toString(), "0");
    const tx = await conn.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    const t = new Transaction().add(...ixs);
    t.recentBlockhash = PublicKey.default.toBase58();
    t.feePayer = payer.publicKey;
    const size = t.serialize({ requireAllSignatures: false, verifySignatures: false }).length;
    console.log(`# settle kind 0: ${tx?.meta?.computeUnitsConsumed} CU, tx ${size} bytes (limit 1232), msg ${msg.length} bytes`);
  });

  test("settle kind 1 (PRELIQ)", async () => {
    await openPosition(1n, 30_000_000n);
    const args: SettleArgs = { positionId: 1n, quoteId: 5n, repayE6: 2_500_000n, seizeUnits: 30_000_000n, recipient: buyer, nonce: 1n, expires: future(), kind: KIND_PRELIQ };
    const msg = settleMessage(args);
    assert.ok(Buffer.from(msg).toString().endsWith("|kind=PRELIQ"));
    await send([verifyIx(AUTH, msg), await settleIx(args)]);
    assert.equal(await balance(getAssociatedTokenAddressSync(mint, buyer, true)), 30_000_000n);
    assert.equal(await conn.getAccountInfo(positionPda(1n), "confirmed"), null);
  });

  test("settle kind 2 (SELF) with recipient = depositor", async () => {
    await openPosition(3n, 7_000_000n);
    const before = await balance(depositorAta);
    const args: SettleArgs = { positionId: 3n, quoteId: 6n, repayE6: 1n, seizeUnits: 4_000_000n, recipient: depositor.publicKey, nonce: 3n, expires: future(), kind: KIND_SELF };
    await send([verifyIx(AUTH, settleMessage(args)), await settleIx(args)]);
    assert.equal((await balance(depositorAta)) - before, 7_000_000n);
  });

  test("release after open pays all units to the depositor and closes the position", async () => {
    await openPosition(2n, 12_345_678n);
    const before = await balance(depositorAta);
    const expires = future();
    const ixs = [verifyIx(AUTH, releaseMessage(2n, 2n, expires)), await releaseIx(2n, 2n, expires)];
    const sig = await send(ixs);
    assert.equal((await balance(depositorAta)) - before, 12_345_678n);
    assert.equal(await conn.getAccountInfo(positionPda(2n), "confirmed"), null);
    const n = await program.account.nonceRecord.fetch(noncePda(2n));
    assert.equal(n.op, 1);
    const tx = await conn.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    console.log(`# release: ${tx?.meta?.computeUnitsConsumed} CU`);
  });
});

describe("nectar_vault negative paths", () => {
  test("wrong message: signed seize_units differs from the instruction args", async () => {
    const args = victimSettle();
    const signed = settleMessage({ ...args, seizeUnits: args.seizeUnits + 1n });
    await expectFail(send([verifyIx(AUTH, signed), await settleIx(args)]), "Error Code: MessageMismatch");
  });

  test("missing verify instruction", async () => {
    await expectFail(send([await settleIx(victimSettle())]), "Error Code: MissingEd25519Verify");
  });

  test("verify instruction not immediately preceding settle", async () => {
    const args = victimSettle();
    const ixs = [verifyIx(AUTH, settleMessage(args)), ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), await settleIx(args)];
    await expectFail(send(ixs), "Error Code: MissingEd25519Verify");
  });

  test("wrong authority: valid signature by another key", async () => {
    const args = victimSettle();
    await expectFail(send([verifyIx(OTHER, settleMessage(args)), await settleIx(args)]), "Error Code: PubkeyMismatch");
  });

  test("replayed nonce: nonce 0 (used by the kind 0 settle) on another position, and the identical settle replayed", async () => {
    const args = victimSettle({ nonce: DEMO_LEG.nonce });
    await expectFail(send([verifyIx(AUTH, settleMessage(args)), await settleIx(args)]), "already in use");
    // Replaying the same signed demo_leg message: the position is closed and the nonce is used.
    const replay: SettleArgs = { ...DEMO_LEG, expires: future(), kind: KIND_LEGACY };
    await expectFail(send([verifyIx(AUTH, settleMessage(replay)), await settleIx(replay)]), "AccountNotInitialized");
  });

  test("expired", async () => {
    const args = victimSettle({ expires: BigInt(Math.floor(Date.now() / 1000) - 120) });
    await expectFail(send([verifyIx(AUTH, settleMessage(args)), await settleIx(args)]), "Error Code: Expired");
  });

  test("release presented with a settlement signature", async () => {
    const expires = future();
    const settleMsg = settleMessage(victimSettle({ nonce: 1001n, expires }));
    await expectFail(send([verifyIx(AUTH, settleMsg), await releaseIx(VICTIM, 1001n, expires)]), "Error Code: MessageMismatch");
  });

  test("release replayed: same release again, and a fresh release reusing its nonce", async () => {
    const expires = future();
    await expectFail(send([verifyIx(AUTH, releaseMessage(2n, 2n, expires)), await releaseIx(2n, 2n, expires)]), "AccountNotInitialized");
    await expectFail(
      send([verifyIx(AUTH, releaseMessage(VICTIM, 2n, expires)), await releaseIx(VICTIM, 2n, expires)]),
      "already in use",
    );
  });

  test("settle presented with a release signature", async () => {
    const args = victimSettle({ nonce: 1002n });
    const relMsg = releaseMessage(VICTIM, 1002n, args.expires);
    await expectFail(send([verifyIx(AUTH, relMsg), await settleIx(args)]), "Error Code: MessageMismatch");
  });

  test("kind mismatch: a kind 1 signature presented as kind 0", async () => {
    const args = victimSettle({ kind: KIND_PRELIQ, nonce: 1003n });
    await expectFail(send([verifyIx(AUTH, settleMessage(args)), await settleIx(args, KIND_LEGACY)]), "Error Code: MessageMismatch");
  });

  test("unknown kind 3", async () => {
    const args = victimSettle({ nonce: 1004n });
    await expectFail(send([verifyIx(AUTH, settleMessage(args)), await settleIx(args, 3)]), "Error Code: InvalidKind");
  });

  test("tampered signature: the Ed25519 program itself rejects the transaction", async () => {
    const args = victimSettle({ nonce: 1005n });
    const msg = settleMessage(args);
    const bad = AUTH.sign(msg);
    bad[0] ^= 1;
    await expectFail(send([verifyIx(AUTH, msg, bad), await settleIx(args)]), "Error processing Instruction 0");
  });

  test("verify instruction whose message offset points at another instruction index", async () => {
    const args = victimSettle({ nonce: 1006n });
    const msg = settleMessage(args);
    const data = ed25519InstructionData(AUTH.pub, AUTH.sign(msg), msg);
    new DataView(data.buffer).setUint16(14, 0, true); // message_instruction_index = 0 (the verify ix itself, still valid for the precompile)
    const ix = new TransactionInstruction({ programId: new PublicKey(ED25519_PROGRAM_ADDRESS), keys: [], data: Buffer.from(data) });
    await expectFail(send([ix, await settleIx(args)]), "Error Code: BadEd25519Layout");
  });

  test("seize_units above the position amount", async () => {
    const args = victimSettle({ seizeUnits: VICTIM_UNITS + 1n, nonce: 1007n });
    await expectFail(send([verifyIx(AUTH, settleMessage(args)), await settleIx(args)]), "Error Code: SeizeExceedsAmount");
  });

  test("recipient account differs from the signed recipient", async () => {
    const args = victimSettle({ nonce: 1008n });
    await expectFail(
      send([verifyIx(AUTH, settleMessage(args)), await settleIx(args, args.kind, Keypair.generate().publicKey)]),
      "Error Code: RecipientMismatch",
    );
  });

  test("victim position is untouched after every rejected attempt", async () => {
    const p = await program.account.position.fetch(positionPda(VICTIM));
    assert.equal(p.amount.toString(), VICTIM_UNITS.toString());
    for (const n of [1000n, 1001n, 1002n, 1003n, 1004n, 1005n, 1006n, 1007n, 1008n]) {
      assert.equal(await conn.getAccountInfo(noncePda(n), "confirmed"), null, `nonce ${n} unused`);
    }
  });
});
