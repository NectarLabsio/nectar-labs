// Offline checks of solana/client: the hand-built Ed25519 instruction (F-082) and the preimages (v1 vectors).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { Ed25519Program, Keypair, PublicKey } from "@solana/web3.js";
import { ed25519InstructionData, ed25519VerifyInstruction, ED25519_PROGRAM_ADDRESS, hexToBytes } from "../client/ed25519.ts";
import { base58Decode, base58Encode, claimSeeds, findProgramAddress, isOnCurve, keyBytes, nonceSeeds, positionSeeds, u64le } from "../client/pda.ts";
import { KIND_LEGACY, KIND_PRELIQ, KIND_SELF, releasePreimage, settlePreimage, utf8 } from "../client/preimage.ts";
import {
  ACCOUNT_DISCRIMINATOR,
  CLAIM_V1,
  DISCRIMINATOR,
  NONCE_RECORD_V2,
  POSITION_V2,
  claimData,
  openPositionData,
  parseClaim,
  parseNonceRecord,
  parsePosition,
  releaseData,
  settleData,
  withdrawData,
} from "../client/vault.ts";
import { edKey } from "./helpers.ts";

test("client: PDA derivation and curve check equal @solana/web3.js", () => {
  const program = Keypair.generate().publicKey;
  for (let i = 0; i < 200; i++) {
    const seed = randomBytes(32);
    assert.equal(isOnCurve(seed), PublicKey.isOnCurve(seed), seed.toString("hex"));
    const seeds = [Buffer.from("pos"), seed, Buffer.from(u64le(BigInt(i)))];
    const [want, wantBump] = PublicKey.findProgramAddressSync(seeds, program);
    const got = findProgramAddress(seeds, program.toBase58());
    assert.equal(got.address, want.toBase58());
    assert.equal(got.bump, wantBump);
  }
});

test("client: base58 round-trips, including leading zeros", () => {
  for (const b of [new Uint8Array(32), Uint8Array.of(0, 0, 1), Uint8Array.of(255), new Uint8Array(randomBytes(32))]) {
    assert.deepEqual(base58Decode(base58Encode(b)), b);
  }
  const k = Keypair.generate().publicKey;
  assert.equal(base58Encode(k.toBytes()), k.toBase58());
  assert.deepEqual(keyBytes(k.toBase58()), k.toBytes());
  assert.throws(() => keyBytes("111"));
  assert.throws(() => base58Decode("0OIl"));
});

test("client: v2 seeds put the depositor in the position and the position in the nonce", () => {
  const [vault, a, b, position] = [Keypair.generate(), Keypair.generate(), Keypair.generate(), Keypair.generate()].map((k) => k.publicKey.toBase58()) as [string, string, string, string];
  assert.deepEqual(positionSeeds(vault, 7n, a), [utf8("pos"), keyBytes(vault), u64le(7n), keyBytes(a)]);
  assert.deepEqual(nonceSeeds(position, 7n), [utf8("nonce"), keyBytes(position), u64le(7n)]);
  assert.deepEqual(claimSeeds(vault, b), [utf8("claim"), keyBytes(vault), keyBytes(b)]);
  assert.throws(() => nonceSeeds("111", 7n));
});

test("client: discriminators follow sha256('account:<Name>') and sha256('global:<name>')", () => {
  const first8 = (s: string): number[] => [...createHash("sha256").update(s).digest().subarray(0, 8)];
  for (const [n, d] of Object.entries(ACCOUNT_DISCRIMINATOR)) assert.deepEqual([...d], first8(`account:${n}`), n);
  for (const [n, d] of Object.entries(DISCRIMINATOR)) assert.deepEqual([...d], first8(`global:${n}`), n);
});

test("client: parsers refuse a wrong length, discriminator or version", () => {
  const cases = [
    { parse: parsePosition, disc: ACCOUNT_DISCRIMINATOR.Position, len: POSITION_V2.len, version: 2 },
    { parse: parseNonceRecord, disc: ACCOUNT_DISCRIMINATOR.NonceRecord, len: NONCE_RECORD_V2.len, version: 2 },
    { parse: parseClaim, disc: ACCOUNT_DISCRIMINATOR.Claim, len: CLAIM_V1.len, version: 1 },
  ];
  for (const c of cases) {
    const ok = new Uint8Array(c.len);
    ok.set(c.disc);
    ok[8] = c.version;
    assert.doesNotThrow(() => c.parse(ok));
    assert.throws(() => c.parse(ok.subarray(0, c.len - 1)), /bytes/);
    const badDisc = ok.slice();
    badDisc[0] = (badDisc[0] as number) ^ 1;
    assert.throws(() => c.parse(badDisc), /not a nectar_vault/);
    const badVersion = ok.slice();
    badVersion[8] = c.version + 1;
    assert.throws(() => c.parse(badVersion), /layout version/);
  }
});

test("client: instruction data lengths", () => {
  const r = Keypair.generate().publicKey.toBase58();
  assert.equal(settleData({ positionId: 1n, quoteId: 2n, repayE6: 3n, seizeUnits: 4n, recipient: r, nonce: 5n, expires: 6n, kind: 1 }).length, 89);
  assert.equal(releaseData(1n, 2n, 3n).length, 32);
  assert.equal(withdrawData(1n).length, 16);
  assert.equal(claimData().length, 8);
  assert.equal(openPositionData(1n, new Uint8Array(32), 2n).length, 56);
  assert.throws(() => openPositionData(1n, new Uint8Array(31), 2n));
  assert.throws(() => u64le(-1n));
});

interface Vector {
  name: string;
  vault_program: string;
  position_id: string;
  quote_id: string;
  repay_e6: string;
  seize_units: string;
  recipient: string;
  nonce: string;
  expires: string;
  preimage: string;
  signature_hex: string;
}
interface VectorFile {
  test_key_seed_hex: string;
  test_public_key_base58: string;
  vectors: Vector[];
}

const VECTORS: VectorFile = JSON.parse(
  readFileSync(new URL("../../contracts/nectar-core/tests/preimage_vectors.json", import.meta.url), "utf8"),
);

test("client: kind 0 preimage equals every v1 vector byte for byte", () => {
  for (const v of VECTORS.vectors) {
    const got = settlePreimage({
      program: v.vault_program,
      positionId: BigInt(v.position_id),
      quoteId: BigInt(v.quote_id),
      repayE6: BigInt(v.repay_e6),
      seizeUnits: BigInt(v.seize_units),
      recipient: v.recipient,
      nonce: BigInt(v.nonce),
      expires: BigInt(v.expires),
      kind: KIND_LEGACY,
    });
    assert.equal(got, v.preimage, v.name);
  }
});

test("client: the vector test key reproduces the v1 signatures (deterministic Ed25519)", () => {
  const key = edKey(hexToBytes(VECTORS.test_key_seed_hex));
  assert.equal(Keypair.fromSeed(hexToBytes(VECTORS.test_key_seed_hex)).publicKey.toBase58(), VECTORS.test_public_key_base58);
  for (const v of VECTORS.vectors) {
    assert.deepEqual(key.sign(utf8(v.preimage)), hexToBytes(v.signature_hex), v.name);
  }
});

test("client: kind suffixes and release format", () => {
  const base = {
    program: "P",
    positionId: 1n,
    quoteId: 2n,
    repayE6: 3n,
    seizeUnits: 4n,
    recipient: "R",
    nonce: 5n,
    expires: 6n,
  };
  const legacy = settlePreimage({ ...base, kind: KIND_LEGACY });
  assert.equal(settlePreimage({ ...base, kind: KIND_PRELIQ }), `${legacy}|kind=PRELIQ`);
  assert.equal(settlePreimage({ ...base, kind: KIND_SELF }), `${legacy}|kind=SELF`);
  assert.equal(
    releasePreimage({ program: "P", positionId: 7n, recipient: "D", nonce: 9n, expires: 10n }),
    "NECTAR_RELEASE_V1|chain=solana-devnet|vault=P|pos=7|recipient=D|nonce=9|expires=10",
  );
});

test("client: hand-built Ed25519 data equals web3.js Ed25519Program output (F-082 layout)", () => {
  const key = edKey(new Uint8Array(32).fill(3));
  const msg = utf8("NECTAR_SETTLE_V1|chain=solana-devnet|pos=1");
  const sig = key.sign(msg);
  const mine = ed25519InstructionData(key.pub, sig, msg);
  const ref = Ed25519Program.createInstructionWithPublicKey({ publicKey: key.pub, message: msg, signature: sig });
  assert.equal(ref.programId.toBase58(), ED25519_PROGRAM_ADDRESS);
  assert.deepEqual(mine, new Uint8Array(ref.data));
  assert.equal(mine.length, 112 + msg.length);
  const ix = ed25519VerifyInstruction(key.pub, sig, msg);
  assert.equal(ix.programAddress, ED25519_PROGRAM_ADDRESS);
  assert.equal(ix.accounts?.length, 0);
  assert.throws(() => ed25519InstructionData(key.pub.slice(1), sig, msg));
  assert.throws(() => ed25519InstructionData(key.pub, sig.slice(1), msg));
});
