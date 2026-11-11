// nectar_vault v2 addresses (interface-v7 §E). Node only (node:crypto); no npm imports at runtime, so the keeper can
// import this file directly even though solana/ is not a workspace member. Checked against @solana/web3.js in
// tests/client.test.ts. Browser code keeps using `getProgramDerivedAddress` with the seed builders below.
import { createHash } from "node:crypto";

export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const ASSOCIATED_TOKEN_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"; // F-358
export const SYSTEM_PROGRAM = "11111111111111111111111111111111";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base58Decode(s: string): Uint8Array {
  let n = 0n;
  let zeros = 0;
  let leading = true;
  for (const c of s) {
    const v = ALPHABET.indexOf(c);
    if (v < 0) throw new Error(`base58: invalid character ${c}`);
    if (leading && v === 0) zeros++;
    else leading = false;
    n = n * 58n + BigInt(v);
  }
  const body: number[] = [];
  for (; n > 0n; n >>= 8n) body.push(Number(n & 0xffn));
  return Uint8Array.from([...new Array<number>(zeros).fill(0), ...body.reverse()]);
}

export function base58Encode(b: Uint8Array): string {
  let n = 0n;
  let zeros = 0;
  let leading = true;
  for (const x of b) {
    if (leading && x === 0) zeros++;
    else leading = false;
    n = (n << 8n) | BigInt(x);
  }
  let out = "";
  for (; n > 0n; n /= 58n) out = ALPHABET[Number(n % 58n)] + out;
  return "1".repeat(zeros) + out;
}

/** 32-byte key from a base58 address; throws on any other length. */
export function keyBytes(address: string): Uint8Array {
  const b = base58Decode(address);
  if (b.length !== 32) throw new Error(`expected a 32-byte key, got ${b.length} bytes: ${address}`);
  return b;
}

export function u64le(n: bigint): Uint8Array {
  if (n < 0n || n >= 1n << 64n) throw new Error(`u64 out of range: ${n}`);
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, n, true);
  return out;
}

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

// Seeds, exactly as the program declares them. Keys are base58.
export const vaultSeeds = (mint: string): Uint8Array[] => [utf8("vault"), keyBytes(mint)];
export const vaultTokensSeeds = (vault: string): Uint8Array[] => [utf8("tokens"), keyBytes(vault)];
export const positionSeeds = (vault: string, positionId: bigint, depositor: string): Uint8Array[] => [
  utf8("pos"),
  keyBytes(vault),
  u64le(positionId),
  keyBytes(depositor),
];
/** `position` is the slot's PDA address (see `positionAddress`); `authority` is the 32 raw bytes stored on the slot. */
export const nonceSeeds = (position: string, authority: Uint8Array, nonce: bigint): Uint8Array[] => {
  if (authority.length !== 32) throw new Error(`authority must be 32 bytes, got ${authority.length}`);
  return [utf8("nonce"), keyBytes(position), authority, u64le(nonce)];
};
export const claimSeeds = (vault: string, recipient: string): Uint8Array[] => [utf8("claim"), keyBytes(vault), keyBytes(recipient)];
export const ataSeeds = (owner: string, tokenProgram: string, mint: string): Uint8Array[] => [
  keyBytes(owner),
  keyBytes(tokenProgram),
  keyBytes(mint),
];

const P = (1n << 255n) - 19n;
const mod = (a: bigint): bigint => ((a % P) + P) % P;
function pow(base: bigint, exp: bigint): bigint {
  let r = 1n;
  let b = mod(base);
  for (let e = exp; e > 0n; e >>= 1n) {
    if (e & 1n) r = (r * b) % P;
    b = (b * b) % P;
  }
  return r;
}
const D = mod(-121665n * pow(121666n, P - 2n));

/** Same answer as the runtime's point decompression: (y^2 - 1) / (d y^2 + 1) must be a square. */
export function isOnCurve(key: Uint8Array): boolean {
  let y = 0n;
  for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(i === 31 ? (key[31] as number) & 0x7f : (key[i] as number));
  const y2 = mod(y * y);
  const ratio = mod(mod(y2 - 1n) * pow(mod(D * y2 + 1n), P - 2n));
  return ratio === 0n || pow(ratio, (P - 1n) / 2n) === 1n;
}

const PDA_MARKER = utf8("ProgramDerivedAddress");

export function findProgramAddress(seeds: Uint8Array[], program: string): { address: string; bump: number } {
  const programBytes = keyBytes(program);
  for (let bump = 255; bump >= 0; bump--) {
    const h = createHash("sha256");
    for (const s of seeds) h.update(s);
    h.update(Uint8Array.of(bump)).update(programBytes).update(PDA_MARKER);
    const candidate = new Uint8Array(h.digest());
    if (!isOnCurve(candidate)) return { address: base58Encode(candidate), bump };
  }
  throw new Error("no viable bump");
}

const find = (seeds: Uint8Array[], program: string): string => findProgramAddress(seeds, program).address;

export const vaultAddress = (program: string, mint: string): string => find(vaultSeeds(mint), program);
export const vaultTokensAddress = (program: string, vault: string): string => find(vaultTokensSeeds(vault), program);
export const positionAddress = (program: string, vault: string, positionId: bigint, depositor: string): string =>
  find(positionSeeds(vault, positionId, depositor), program);
export const nonceAddress = (program: string, position: string, authority: Uint8Array, nonce: bigint): string =>
  find(nonceSeeds(position, authority, nonce), program);
export const claimAddress = (program: string, vault: string, recipient: string): string => find(claimSeeds(vault, recipient), program);
export const associatedTokenAddress = (owner: string, mint: string, tokenProgram: string = TOKEN_PROGRAM): string =>
  find(ataSeeds(owner, tokenProgram, mint), ASSOCIATED_TOKEN_PROGRAM);
