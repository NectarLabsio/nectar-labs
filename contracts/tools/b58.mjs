// Minimal base58 (Bitcoin alphabet, as Solana and NEAR keys use) + hex, so the tools need only @noble/*.
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function base58encode(bytes) {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let s = '';
  while (n > 0n) {
    s = ALPHABET[Number(n % 58n)] + s;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    s = '1' + s;
  }
  return s;
}

export function base58decode(str, len) {
  let n = 0n;
  for (const c of str) {
    const i = ALPHABET.indexOf(c);
    if (i < 0) throw new Error(`bad base58 char ${c}`);
    n = n * 58n + BigInt(i);
  }
  const out = [];
  while (n > 0n) {
    out.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  for (const c of str) {
    if (c !== '1') break;
    out.unshift(0);
  }
  if (len !== undefined && out.length !== len) throw new Error(`base58 length ${out.length} != ${len}`);
  return Uint8Array.from(out);
}

export const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
