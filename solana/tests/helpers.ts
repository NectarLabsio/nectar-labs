// Test-only Ed25519 signer from a 32-byte seed (Node crypto; stands in for the NEAR MPC key locally).
import { createPrivateKey, sign } from "node:crypto";
import { Keypair } from "@solana/web3.js";

const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

export interface EdKey {
  pub: Uint8Array;
  sign: (message: Uint8Array) => Uint8Array;
}

export function edKey(seed: Uint8Array): EdKey {
  const priv = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, Buffer.from(seed)]), format: "der", type: "pkcs8" });
  return {
    pub: Keypair.fromSeed(seed).publicKey.toBytes(),
    sign: (message) => new Uint8Array(sign(null, message, priv)),
  };
}

export function errText(e: unknown): string {
  const parts = [String(e)];
  if (e !== null && typeof e === "object") {
    const o = e as { logs?: unknown; transactionLogs?: unknown; transactionMessage?: unknown };
    for (const l of [o.logs, o.transactionLogs]) if (Array.isArray(l)) parts.push(l.join("\n"));
    if (typeof o.transactionMessage === "string") parts.push(o.transactionMessage);
  }
  return parts.join("\n");
}
