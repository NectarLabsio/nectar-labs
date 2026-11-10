// Offline checks of solana/client: the hand-built Ed25519 instruction (F-082) and the preimages (v1 vectors).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Ed25519Program, Keypair } from "@solana/web3.js";
import { ed25519InstructionData, ed25519VerifyInstruction, ED25519_PROGRAM_ADDRESS, hexToBytes } from "../client/ed25519.ts";
import { KIND_LEGACY, KIND_PRELIQ, KIND_SELF, releasePreimage, settlePreimage, utf8 } from "../client/preimage.ts";
import { edKey } from "./helpers.ts";

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
