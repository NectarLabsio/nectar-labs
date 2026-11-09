// Canonical settlement preimage, PRD §9 (built by the contract, never by the keeper):
//   NECTAR_SETTLE_V1|chain=<chain>|program=<vault_program>|pos=<position_id>|quote=<quote_id>|repay_e6=<n>|seize_units=<n>|recipient=<buyer_remote_recipient>|nonce=<n>|expires=<unix_s>
// ASCII, pipe-separated, decimal integers, no spaces. Signed as payload_v2 { Eddsa: hex(utf8(preimage)) } (no pre-hash).
// This module must stay byte-identical with the contract's builder and the Solana program's rebuild;
// test/preimage.test.ts pins the exact bytes.

export const PREIMAGE_TAG = "NECTAR_SETTLE_V1";

/** Field order is part of the format. Do not reorder. */
export const PREIMAGE_FIELDS = ["chain", "program", "pos", "quote", "repay_e6", "seize_units", "recipient", "nonce", "expires"] as const;
export type PreimageField = (typeof PREIMAGE_FIELDS)[number];

export interface PreimageInput {
  chain: string;
  program: string;
  pos: string | bigint;
  quote: string | bigint;
  repay_e6: string | bigint;
  seize_units: string | bigint;
  recipient: string;
  nonce: string | bigint;
  expires: string | bigint;
}

export type Preimage = Record<PreimageField, string>;

const DEC = /^(0|[1-9][0-9]*)$/;
// Printable ASCII without space, '|' or '='.
const TOKEN = /^[\x21-\x3c\x3e-\x7b\x7d\x7e]+$/;
const INT_FIELDS: ReadonlySet<PreimageField> = new Set(["pos", "quote", "repay_e6", "seize_units", "nonce", "expires"]);
const U64_FIELDS: ReadonlySet<PreimageField> = new Set(["pos", "quote", "nonce", "expires"]);

function norm(field: PreimageField, v: string | bigint): string {
  const s = typeof v === "bigint" ? v.toString() : v;
  if (INT_FIELDS.has(field)) {
    if (!DEC.test(s)) throw new Error(`preimage ${field}: decimal integer without sign or leading zeros required, got ${JSON.stringify(s)}`);
    const max = U64_FIELDS.has(field) ? 1n << 64n : 1n << 128n;
    if (BigInt(s) >= max) throw new Error(`preimage ${field}: out of range`);
  } else if (!TOKEN.test(s)) {
    throw new Error(`preimage ${field}: printable ASCII without space, '|' or '=' required, got ${JSON.stringify(s)}`);
  }
  return s;
}

export function buildPreimage(i: PreimageInput): string {
  const parts: string[] = [PREIMAGE_TAG];
  for (const f of PREIMAGE_FIELDS) parts.push(`${f}=${norm(f, i[f])}`);
  return parts.join("|");
}

export function parsePreimage(s: string): Preimage {
  const parts = s.split("|");
  if (parts[0] !== PREIMAGE_TAG) throw new Error("preimage: bad tag");
  if (parts.length !== PREIMAGE_FIELDS.length + 1) throw new Error("preimage: wrong field count");
  const out = {} as Preimage;
  PREIMAGE_FIELDS.forEach((f, idx) => {
    const p = parts[idx + 1] ?? "";
    const prefix = `${f}=`;
    if (!p.startsWith(prefix)) throw new Error(`preimage: expected ${f} at position ${idx + 1}`);
    out[f] = norm(f, p.slice(prefix.length));
  });
  if (buildPreimage(out) !== s) throw new Error("preimage: not canonical");
  return out;
}

export function preimageBytes(s: string): Uint8Array {
  for (let k = 0; k < s.length; k++) if (s.charCodeAt(k) > 0x7e || s.charCodeAt(k) < 0x21) throw new Error("preimage: non-ASCII or whitespace byte");
  return new TextEncoder().encode(s);
}

/** Hex of the UTF-8 bytes, as sent in `payload_v2: { Eddsa: <hex> }`. Lowercase, no 0x. */
export function preimagePayloadHex(s: string): string {
  return Array.from(preimageBytes(s), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** MPC sign request body for this preimage (F-031, F-032: domain 1 = Ed25519). */
export function signRequest(preimage: string, path: string): { path: string; payload_v2: { Eddsa: string }; domain_id: 1 } {
  return { path, payload_v2: { Eddsa: preimagePayloadHex(preimage) }, domain_id: 1 };
}
