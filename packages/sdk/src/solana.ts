// nectar_vault v2 client for the web app (WO-31, WO-34w, D-020, interface-v7 §E): @solana/kit 8.6.0 instruction builders, PDAs, the
// Ed25519 verify instruction (F-082, byte-identical to solana/client/ed25519.ts) and a minimal devnet JSON-RPC reader.
// Layouts: solana/deploy.md "Interface v2" and solana/client/{pda,vault}.ts; packages/sdk/test/solana.test.ts compares every builder
// with those helpers byte for byte. Integers only; amounts are u64 base units.
//   open_position data = disc(8) ‖ position_id u64 LE ‖ authority [u8;32] ‖ amount u64 LE          (56 B)
//   release data       = disc(8) ‖ position_id u64 LE ‖ nonce u64 LE ‖ expires i64 LE              (32 B)
//   withdraw data      = disc(8) ‖ position_id u64 LE                                              (16 B)
//   claim data         = disc(8)                                                                   ( 8 B)
//   tx (release)       = [Ed25519 verify ix, release ix]; nothing may sit between them (deploy.md)
import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createTransactionMessage,
  getAddressDecoder,
  getAddressEncoder,
  getBase58Decoder,
  getBase58Encoder,
  getProgramDerivedAddress,
  getTransactionEncoder,
  isOffCurveAddress,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Blockhash,
  type Instruction,
} from "@solana/kit";

// ---------------------------------------------------------------- program ids and layouts

export const ED25519_PROGRAM_ADDRESS = "Ed25519SigVerify111111111111111111111111111" as Address; // F-080
export const INSTRUCTIONS_SYSVAR_ADDRESS = "Sysvar1nstructions1111111111111111111111111" as Address; // F-082
export const SYSTEM_PROGRAM_ADDRESS = "11111111111111111111111111111111" as Address;
/** Classic SPL Token: the mock mint is made by `spl-token create-token` (scripts/05-solana.sh); @solana/spl-token 0.4.15 TOKEN_PROGRAM_ID. */
export const TOKEN_PROGRAM_ADDRESS = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as Address;
/** @solana/spl-token 0.4.15 ASSOCIATED_TOKEN_PROGRAM_ID. */
export const ASSOCIATED_TOKEN_PROGRAM_ADDRESS = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL" as Address;
/** Wallet Standard chain id (@solana/wallet-standard-chains 1.1.2 SOLANA_DEVNET_CHAIN). */
export const SOLANA_DEVNET_CHAIN = "solana:devnet";
/** Public devnet endpoint named by @solana/wallet-standard-chains 1.1.2 and scripts/05-solana.sh. */
export const SOLANA_DEVNET_RPC = "https://api.devnet.solana.com";

export const DISCRIMINATOR = {
  init_vault: [77, 79, 85, 150, 33, 217, 52, 106],
  open_position: [135, 128, 47, 77, 15, 152, 240, 49],
  settle: [175, 42, 185, 87, 144, 131, 102, 212],
  release: [253, 249, 15, 206, 28, 127, 193, 241],
  withdraw: [183, 18, 70, 156, 148, 109, 161, 34],
  claim: [62, 198, 214, 193, 213, 159, 108, 210],
  /** `Position` account discriminator. */
  position_account: [170, 188, 143, 228, 122, 64, 247, 208],
  /** `Claim` account discriminator. */
  claim_account: [155, 70, 22, 176, 123, 215, 246, 102],
} as const;

/** `Position` v2 account (deploy.md): 131 bytes. */
export const POSITION_ACCOUNT = {
  size: 131,
  version: 8,
  authority: 9,
  depositor: 41,
  amount: 73,
  status: 81,
  vault: 82,
  position_id: 114,
  bump: 122,
  withdrawable: 123,
} as const;
export const POSITION_LAYOUT_VERSION = 2;
export const POSITION_STATUS_OPEN = 1;
export const POSITION_STATUS_SETTLED = 2;
export const POSITION_STATUS_RELEASED = 3;

/** `NonceRecord` v2 account (deploy.md): 91 bytes. Only its size matters here, for the rent shown in the sign preview. */
export const NONCE_RECORD_ACCOUNT = { size: 91 } as const;

/** `Claim` v1 account (deploy.md): 82 bytes. */
export const CLAIM_ACCOUNT = { size: 82, version: 8, vault: 9, recipient: 41, amount: 73, bump: 81 } as const;
export const CLAIM_LAYOUT_VERSION = 1;

const U64_MAX = (1n << 64n) - 1n;
const I64_MIN = -(1n << 63n);
const I64_MAX = (1n << 63n) - 1n;

// ---------------------------------------------------------------- bytes

export function u64le(n: bigint, field = "u64"): Uint8Array {
  if (n < 0n || n > U64_MAX) throw new Error(`${field} does not fit u64`);
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, n, true);
  return b;
}

export function i64le(n: bigint, field = "i64"): Uint8Array {
  if (n < I64_MIN || n > I64_MAX) throw new Error(`${field} does not fit i64`);
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigInt64(0, n, true);
  return b;
}

function concat(...parts: ArrayLike<number>[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (h.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(h)) throw new Error("hexToBytes: invalid hex");
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(2 * i, 2 * i + 2), 16);
  return out;
}

export const bytesToHex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

export const base58ToBytes = (s: string): Uint8Array => new Uint8Array(getBase58Encoder().encode(s));
export const bytesToBase58 = (b: Uint8Array): string => getBase58Decoder().decode(b);

// ---------------------------------------------------------------- authority ("ed25519:<b58>" from NEAR)

/** `remote.authority` from nectar-core (`"ed25519:<base58>"`, interface-v7 §B) → the 32 raw key bytes the vault stores. */
export function parseEd25519Authority(authority: string): Uint8Array {
  const s = authority.trim();
  const b58 = s.startsWith("ed25519:") ? s.slice("ed25519:".length) : s;
  if (s.includes(":") && !s.startsWith("ed25519:")) throw new Error(`authority must be an ed25519 key, got ${JSON.stringify(s.slice(0, 16))}`);
  let bytes: Uint8Array;
  try {
    bytes = base58ToBytes(b58);
  } catch {
    throw new Error("authority is not base58");
  }
  if (bytes.length !== 32) throw new Error(`authority must be 32 bytes, got ${bytes.length}`);
  return bytes;
}

/** 32 key bytes → `"ed25519:<b58>"` (the NEAR form). */
export const formatEd25519Authority = (bytes: Uint8Array): string => `ed25519:${bytesToBase58(bytes)}`;

/** The same 32 bytes as a Solana address (base58), which is how explorers show the vault's `position.authority`. */
export const authorityAsAddress = (authority: string): string => bytesToBase58(parseEd25519Authority(authority));

export function isSolanaAddress(s: string): boolean {
  try {
    address(s);
    return true;
  } catch {
    return false;
  }
}

/** A wallet key: base58, 32 bytes and on the curve. nectar-core refuses anything else as a depositor or a buyer recipient (SR-7, SR-8). */
export function isSolanaWalletKey(s: string): boolean {
  return isSolanaAddress(s) && !isOffCurveAddress(address(s));
}

// ---------------------------------------------------------------- PDAs (deploy.md)

const enc = new TextEncoder();
const addrBytes = (a: string): Uint8Array => new Uint8Array(getAddressEncoder().encode(address(a)));

export async function vaultPda(program: string, mint: string): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({ programAddress: address(program), seeds: [enc.encode("vault"), addrBytes(mint)] });
  return pda;
}
export async function vaultTokensPda(program: string, vault: string): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({ programAddress: address(program), seeds: [enc.encode("tokens"), addrBytes(vault)] });
  return pda;
}
/** `["pos", vault, u64le(position_id), depositor]`: one slot per depositor (SR-8). */
export async function positionPda(program: string, vault: string, positionId: bigint, depositor: string): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({ programAddress: address(program), seeds: [enc.encode("pos"), addrBytes(vault), u64le(positionId, "position_id"), addrBytes(depositor)] });
  return pda;
}
/** `["nonce", position_pda, u64le(nonce)]`: scoped to the depositor-bound slot (SR-1). */
export async function noncePda(program: string, position: string, nonce: bigint): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({ programAddress: address(program), seeds: [enc.encode("nonce"), addrBytes(position), u64le(nonce, "nonce")] });
  return pda;
}
/** `["claim", vault, recipient]`. */
export async function claimPda(program: string, vault: string, recipient: string): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({ programAddress: address(program), seeds: [enc.encode("claim"), addrBytes(vault), addrBytes(recipient)] });
  return pda;
}
/** Associated token account: seeds `[owner, token_program, mint]` under the ATA program. */
export async function associatedTokenAddress(owner: string, mint: string, tokenProgram: string = TOKEN_PROGRAM_ADDRESS): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    seeds: [addrBytes(owner), addrBytes(tokenProgram), addrBytes(mint)],
  });
  return pda;
}

// ---------------------------------------------------------------- instruction data

export function openPositionData(positionId: bigint, authority: Uint8Array, amount: bigint): Uint8Array {
  if (authority.length !== 32) throw new Error("authority must be 32 bytes");
  if (amount <= 0n) throw new Error("amount must be positive");
  return concat(DISCRIMINATOR.open_position, u64le(positionId, "position_id"), authority, u64le(amount, "amount"));
}

export function releaseData(positionId: bigint, nonce: bigint, expires: bigint): Uint8Array {
  return concat(DISCRIMINATOR.release, u64le(positionId, "position_id"), u64le(nonce, "nonce"), i64le(expires, "expires"));
}

export function withdrawData(positionId: bigint): Uint8Array {
  return concat(DISCRIMINATOR.withdraw, u64le(positionId, "position_id"));
}

export const claimData = (): Uint8Array => Uint8Array.from(DISCRIMINATOR.claim);

/** A named account, for the sign preview. */
export interface NamedAccount {
  name: string;
  address: Address;
  role: AccountRole;
}

/** An instruction plus what the sign modal shows: program label, named accounts, decoded args and the raw data. */
export interface DescribedInstruction {
  instruction: Instruction & { data: Uint8Array };
  program: string;
  label: string;
  accounts: NamedAccount[];
  args: Record<string, string>;
}

const ix = (programAddress: Address, accounts: NamedAccount[], data: Uint8Array): Instruction & { data: Uint8Array } => ({
  programAddress,
  accounts: accounts.map((a) => ({ address: a.address, role: a.role })),
  data,
});

export interface VaultIds {
  /** nectar_vault program id (config `solana.vault_program`). */
  program: string;
  /** Mock NVDAx SPL mint (config `solana.mint`). */
  mint: string;
  /** The owner of the mint account; the program enforces it. Default: classic SPL Token. */
  tokenProgram?: string;
}

const tokenProgramOf = (ids: VaultIds): Address => address(ids.tokenProgram ?? TOKEN_PROGRAM_ADDRESS);

/**
 * `open_position(position_id, authority, amount)`. Accounts (lib.rs OpenPosition): depositor (signer, w), vault, mint,
 * vault_tokens (w), depositor_tokens (w; the depositor's ATA), position (w), token_program, system_program.
 */
export async function openPositionInstruction(
  ids: VaultIds,
  p: { depositor: string; positionId: bigint; authority: string; amount: bigint },
): Promise<DescribedInstruction> {
  const auth = parseEd25519Authority(p.authority);
  const vault = await vaultPda(ids.program, ids.mint);
  const accounts: NamedAccount[] = [
    { name: "depositor", address: address(p.depositor), role: AccountRole.WRITABLE_SIGNER },
    { name: "vault", address: vault, role: AccountRole.READONLY },
    { name: "mint", address: address(ids.mint), role: AccountRole.READONLY },
    { name: "vault_tokens", address: await vaultTokensPda(ids.program, vault), role: AccountRole.WRITABLE },
    { name: "depositor_tokens", address: await associatedTokenAddress(p.depositor, ids.mint, tokenProgramOf(ids)), role: AccountRole.WRITABLE },
    { name: "position", address: await positionPda(ids.program, vault, p.positionId, p.depositor), role: AccountRole.WRITABLE },
    { name: "token_program", address: tokenProgramOf(ids), role: AccountRole.READONLY },
    { name: "system_program", address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
  ];
  return {
    instruction: ix(address(ids.program), accounts, openPositionData(p.positionId, auth, p.amount)),
    program: ids.program,
    label: "nectar_vault.open_position",
    accounts,
    args: { position_id: p.positionId.toString(), authority: bytesToBase58(auth), amount: p.amount.toString() },
  };
}

/**
 * `release(position_id, nonce, expires)`. Accounts (deploy.md): payer (signer, w), vault, position (w), nonce_record (w), instructions
 * sysvar, system_program. Moves no tokens: it records the whole amount as `withdrawable`, and the depositor then signs `withdraw`.
 */
export async function releaseInstruction(
  ids: VaultIds,
  p: { payer: string; depositor: string; positionId: bigint; nonce: bigint; expires: bigint },
): Promise<DescribedInstruction> {
  const vault = await vaultPda(ids.program, ids.mint);
  const position = await positionPda(ids.program, vault, p.positionId, p.depositor);
  const accounts: NamedAccount[] = [
    { name: "payer", address: address(p.payer), role: AccountRole.WRITABLE_SIGNER },
    { name: "vault", address: vault, role: AccountRole.READONLY },
    { name: "position", address: position, role: AccountRole.WRITABLE },
    { name: "nonce_record", address: await noncePda(ids.program, position, p.nonce), role: AccountRole.WRITABLE },
    { name: "instructions", address: INSTRUCTIONS_SYSVAR_ADDRESS, role: AccountRole.READONLY },
    { name: "system_program", address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
  ];
  return {
    instruction: ix(address(ids.program), accounts, releaseData(p.positionId, p.nonce, p.expires)),
    program: ids.program,
    label: "nectar_vault.release",
    accounts,
    args: { position_id: p.positionId.toString(), nonce: p.nonce.toString(), expires: p.expires.toString() },
  };
}

/**
 * `withdraw(position_id)`, signed by the depositor after settle or release. Accounts (deploy.md): depositor (signer, w), vault, mint,
 * vault_tokens (w), position (w), destination (w; any token account of the mint except the vault's own), token_program.
 */
export async function withdrawInstruction(ids: VaultIds, p: { depositor: string; positionId: bigint; destination: string }): Promise<DescribedInstruction> {
  const vault = await vaultPda(ids.program, ids.mint);
  const accounts: NamedAccount[] = [
    { name: "depositor", address: address(p.depositor), role: AccountRole.WRITABLE_SIGNER },
    { name: "vault", address: vault, role: AccountRole.READONLY },
    { name: "mint", address: address(ids.mint), role: AccountRole.READONLY },
    { name: "vault_tokens", address: await vaultTokensPda(ids.program, vault), role: AccountRole.WRITABLE },
    { name: "position", address: await positionPda(ids.program, vault, p.positionId, p.depositor), role: AccountRole.WRITABLE },
    { name: "destination", address: address(p.destination), role: AccountRole.WRITABLE },
    { name: "token_program", address: tokenProgramOf(ids), role: AccountRole.READONLY },
  ];
  return {
    instruction: ix(address(ids.program), accounts, withdrawData(p.positionId)),
    program: ids.program,
    label: "nectar_vault.withdraw",
    accounts,
    args: { position_id: p.positionId.toString() },
  };
}

/**
 * `claim()`, signed by the recipient: pays the whole `Claim` and closes it. Accounts (deploy.md): recipient (signer, w), vault, mint,
 * vault_tokens (w), claim (w), destination (w; any token account of the mint except the vault's own), token_program.
 */
export async function claimInstruction(ids: VaultIds, p: { recipient: string; destination: string }): Promise<DescribedInstruction> {
  const vault = await vaultPda(ids.program, ids.mint);
  const accounts: NamedAccount[] = [
    { name: "recipient", address: address(p.recipient), role: AccountRole.WRITABLE_SIGNER },
    { name: "vault", address: vault, role: AccountRole.READONLY },
    { name: "mint", address: address(ids.mint), role: AccountRole.READONLY },
    { name: "vault_tokens", address: await vaultTokensPda(ids.program, vault), role: AccountRole.WRITABLE },
    { name: "claim", address: await claimPda(ids.program, vault, p.recipient), role: AccountRole.WRITABLE },
    { name: "destination", address: address(p.destination), role: AccountRole.WRITABLE },
    { name: "token_program", address: tokenProgramOf(ids), role: AccountRole.READONLY },
  ];
  return { instruction: ix(address(ids.program), accounts, claimData()), program: ids.program, label: "nectar_vault.claim", accounts, args: {} };
}

// ---------------------------------------------------------------- Ed25519 verify instruction (F-082)
// Ported from solana/client/ed25519.ts; packages/sdk/test/solana.test.ts asserts the two produce identical bytes.
//   [num_signatures=1 u8, padding=0 u8]
//   Ed25519SignatureOffsets (7 x u16 LE): signature_offset=48, signature_instruction_index=0xFFFF,
//     public_key_offset=16, public_key_instruction_index=0xFFFF, message_data_offset=112,
//     message_data_size=len(message), message_instruction_index=0xFFFF
//   pubkey (32 B) @16 · signature (64 B) @48 · message @112. No accounts.

export const ED25519_PUBKEY_OFFSET = 16;
export const ED25519_SIGNATURE_OFFSET = 48;
export const ED25519_MESSAGE_OFFSET = 112;
const THIS_INSTRUCTION = 0xffff;

export function ed25519InstructionData(publicKey: Uint8Array, signature: Uint8Array, message: Uint8Array): Uint8Array {
  if (publicKey.length !== 32) throw new Error(`ed25519: public key must be 32 bytes, got ${publicKey.length}`);
  if (signature.length !== 64) throw new Error(`ed25519: signature must be 64 bytes, got ${signature.length}`);
  if (message.length > 0xffff - ED25519_MESSAGE_OFFSET) throw new Error("ed25519: message too long");
  const data = new Uint8Array(ED25519_MESSAGE_OFFSET + message.length);
  const view = new DataView(data.buffer);
  data[0] = 1;
  data[1] = 0;
  const offsets = [ED25519_SIGNATURE_OFFSET, THIS_INSTRUCTION, ED25519_PUBKEY_OFFSET, THIS_INSTRUCTION, ED25519_MESSAGE_OFFSET, message.length, THIS_INSTRUCTION];
  offsets.forEach((v, i) => view.setUint16(2 + 2 * i, v, true));
  data.set(publicKey, ED25519_PUBKEY_OFFSET);
  data.set(signature, ED25519_SIGNATURE_OFFSET);
  data.set(message, ED25519_MESSAGE_OFFSET);
  return data;
}

export function ed25519VerifyInstruction(publicKey: Uint8Array, signature: Uint8Array, message: Uint8Array): DescribedInstruction {
  return {
    instruction: { programAddress: ED25519_PROGRAM_ADDRESS, accounts: [], data: ed25519InstructionData(publicKey, signature, message) },
    program: ED25519_PROGRAM_ADDRESS,
    label: "Ed25519 signature verify",
    accounts: [],
    args: { public_key: bytesToBase58(publicKey), signature_hex: bytesToHex(signature), message: new TextDecoder().decode(message) },
  };
}

// ---------------------------------------------------------------- release preimage (interface-v7 §B)

export const SOLANA_CHAIN = "solana-devnet";

/** Byte-identical to solana/client/preimage.ts `releasePreimage` and the vault's rebuilt string (`vault=` is the program id). */
export function releasePreimage(f: { program: string; positionId: bigint; recipient: string; nonce: bigint; expires: bigint }): string {
  return `NECTAR_RELEASE_V1|chain=${SOLANA_CHAIN}|vault=${f.program}|pos=${f.positionId}|recipient=${f.recipient}|nonce=${f.nonce}|expires=${f.expires}`;
}

/** `get_pending_release(position_id)` (interface-v7 §B). JSON numbers above 2^53 are strings. */
export interface PendingRelease {
  position_id?: string;
  message: string;
  /** Null until the MPC signer answered (`status` AwaitingSignature or SignFailed). */
  signature_hex: string | null;
  nonce: string | number;
  expires: string | number;
  recipient?: string;
  status?: ReleaseStatus;
  solana_tx_sig?: string | null;
}

/** Contract `ReleaseStatus`. */
export type ReleaseStatus = "AwaitingSignature" | "Signed" | "SignFailed" | "Relayed";

export interface ReleasePlan {
  positionId: bigint;
  nonce: bigint;
  expires: bigint;
  recipient: string;
  message: Uint8Array;
  signature: Uint8Array;
}

/**
 * Check a pending release before building the Solana transaction: the message must be exactly what the vault rebuilds
 * (program id, position, depositor, nonce, expires), otherwise the Ed25519 check on-chain would fail and the user pays for nothing.
 */
export function planRelease(pr: PendingRelease, expect: { program: string; positionId: bigint; depositor: string }): ReleasePlan {
  const nonce = BigInt(pr.nonce);
  const expires = BigInt(pr.expires);
  const rebuilt = releasePreimage({ program: expect.program, positionId: expect.positionId, recipient: expect.depositor, nonce, expires });
  if (pr.message !== rebuilt) throw new Error("The signed release message does not match this vault, position and depositor.");
  if (!pr.signature_hex) throw new Error("The release is not signed yet.");
  const signature = hexToBytes(pr.signature_hex);
  if (signature.length !== 64) throw new Error("The release signature is not 64 bytes.");
  return { positionId: expect.positionId, nonce, expires, recipient: expect.depositor, message: enc.encode(pr.message), signature };
}

/** `[Ed25519 verify ix, release ix]` for one pending release (deploy.md: nothing may sit between them). */
export async function releaseTransactionInstructions(ids: VaultIds, plan: ReleasePlan, p: { payer: string; authority: string }): Promise<DescribedInstruction[]> {
  const verify = ed25519VerifyInstruction(parseEd25519Authority(p.authority), plan.signature, plan.message);
  const release = await releaseInstruction(ids, { payer: p.payer, depositor: plan.recipient, positionId: plan.positionId, nonce: plan.nonce, expires: plan.expires });
  return [verify, release];
}

// ---------------------------------------------------------------- transaction (wire bytes for Wallet Standard)

/** Compile a v0 transaction with empty signature slots: the bytes `solana:signAndSendTransaction` expects. */
export function compileWireTransaction(instructions: ReadonlyArray<Instruction>, feePayer: string, blockhash: { blockhash: string; lastValidBlockHeight: bigint }): Uint8Array {
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(address(feePayer), m),
    (m) => setTransactionMessageLifetimeUsingBlockhash({ blockhash: blockhash.blockhash as Blockhash, lastValidBlockHeight: blockhash.lastValidBlockHeight }, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  return new Uint8Array(getTransactionEncoder().encode(compileTransaction(message)));
}

/** Base fee: 5000 lamports per signature (one signer here). Shown in the sign preview; the wallet shows its own estimate too. */
export const LAMPORTS_PER_SIGNATURE = 5000n;
export const LAMPORTS_PER_SOL = 1_000_000_000n;

export function formatLamports(l: bigint): string {
  const whole = l / LAMPORTS_PER_SOL;
  const frac = (l % LAMPORTS_PER_SOL).toString().padStart(9, "0").replace(/0+$/, "");
  return `${whole}${frac ? "." + frac : ""} SOL`;
}

// ---------------------------------------------------------------- account decode

export interface VaultPosition {
  version: number;
  authority: string; // base58 of the 32 key bytes
  depositor: string;
  amount: bigint;
  status: number;
  vault: string;
  positionId: bigint;
  bump: number;
  /** Units the depositor can `withdraw`: 0 while Open; set by settle (the remainder) or release (everything). */
  withdrawable: bigint;
}

function checkLayout(data: Uint8Array, name: string, size: number, disc: readonly number[], version: number): DataView {
  if (data.length !== size) throw new Error(`${name} account is ${data.length} bytes, expected ${size}`);
  if (!disc.every((b, i) => data[i] === b)) throw new Error(`Not a nectar_vault ${name} account`);
  if (data[8] !== version) throw new Error(`${name} layout version is ${data[8]}, expected ${version}`);
  return new DataView(data.buffer, data.byteOffset, data.byteLength);
}

/** Decodes a `Position` v2 account. The caller checks that the account owner is the vault program (`SolanaReader.vaultPosition` does). */
export function decodeVaultPosition(data: Uint8Array): VaultPosition {
  const L = POSITION_ACCOUNT;
  const v = checkLayout(data, "Position", L.size, DISCRIMINATOR.position_account, POSITION_LAYOUT_VERSION);
  const dec = getAddressDecoder();
  return {
    version: data[L.version]!,
    authority: bytesToBase58(data.slice(L.authority, L.authority + 32)),
    depositor: dec.decode(data.slice(L.depositor, L.depositor + 32)),
    amount: v.getBigUint64(L.amount, true),
    status: data[L.status]!,
    vault: dec.decode(data.slice(L.vault, L.vault + 32)),
    positionId: v.getBigUint64(L.position_id, true),
    bump: data[L.bump]!,
    withdrawable: v.getBigUint64(L.withdrawable, true),
  };
}

export interface VaultClaim {
  version: number;
  vault: string;
  recipient: string;
  amount: bigint;
  bump: number;
}

/** Decodes a `Claim` v1 account. The caller checks that the account owner is the vault program (`SolanaReader.vaultClaim` does). */
export function decodeVaultClaim(data: Uint8Array): VaultClaim {
  const L = CLAIM_ACCOUNT;
  const v = checkLayout(data, "Claim", L.size, DISCRIMINATOR.claim_account, CLAIM_LAYOUT_VERSION);
  const dec = getAddressDecoder();
  return {
    version: data[L.version]!,
    vault: dec.decode(data.slice(L.vault, L.vault + 32)),
    recipient: dec.decode(data.slice(L.recipient, L.recipient + 32)),
    amount: v.getBigUint64(L.amount, true),
    bump: data[L.bump]!,
  };
}

/** The base of an SPL token account (mint, owner, amount, state), the fields the program's own `payout::accepts` reads. */
export const TOKEN_ACCOUNT = { minSize: 165, mint: 0, owner: 32, amount: 64, state: 108 } as const;
export const TOKEN_STATE_INITIALIZED = 1;

export interface TokenAccountInfo {
  mint: string;
  owner: string;
  amount: bigint;
  /** 0 uninitialized, 1 initialized, 2 frozen. */
  state: number;
}

export function decodeTokenAccount(data: Uint8Array): TokenAccountInfo {
  const L = TOKEN_ACCOUNT;
  if (data.length < L.minSize) throw new Error(`Token account is ${data.length} bytes, expected at least ${L.minSize}`);
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const dec = getAddressDecoder();
  return { mint: dec.decode(data.slice(L.mint, L.mint + 32)), owner: dec.decode(data.slice(L.owner, L.owner + 32)), amount: v.getBigUint64(L.amount, true), state: data[L.state]! };
}

// ---------------------------------------------------------------- devnet JSON-RPC (read-only + status)

export class SolanaRpcError extends Error {
  constructor(
    message: string,
    readonly method: string,
  ) {
    super(message);
    this.name = "SolanaRpcError";
  }
}

const b64ToBytes = (s: string): Uint8Array => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

/** The handful of devnet reads the web flow needs. Plain fetch, so the e2e suite can answer it with a route mock. */
export class SolanaReader {
  constructor(readonly url: string = SOLANA_DEVNET_RPC) {}

  private async call<T>(method: string, params: unknown[]): Promise<T> {
    let r: Response;
    try {
      r = await fetch(this.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    } catch (e) {
      throw new SolanaRpcError(`${method}: ${e instanceof Error ? e.message : String(e)}`, method);
    }
    if (!r.ok) throw new SolanaRpcError(`${method}: HTTP ${r.status}`, method);
    const j = (await r.json()) as { result?: T; error?: { message?: string } };
    if (j.error) throw new SolanaRpcError(`${method}: ${j.error.message ?? "error"}`, method);
    return j.result as T;
  }

  async latestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: bigint }> {
    const r = await this.call<{ value: { blockhash: string; lastValidBlockHeight: number } }>("getLatestBlockhash", [{ commitment: "confirmed" }]);
    return { blockhash: r.value.blockhash, lastValidBlockHeight: BigInt(r.value.lastValidBlockHeight) };
  }

  async balanceLamports(owner: string): Promise<bigint> {
    const r = await this.call<{ value: number }>("getBalance", [owner, { commitment: "confirmed" }]);
    return BigInt(r.value);
  }

  /** SPL balance of an owner's ATA in base units; 0 when the ATA does not exist. */
  async tokenBalance(owner: string, mint: string, tokenProgram: string = TOKEN_PROGRAM_ADDRESS): Promise<bigint> {
    const ata = await associatedTokenAddress(owner, mint, tokenProgram);
    try {
      const r = await this.call<{ value: { amount: string } }>("getTokenAccountBalance", [ata, { commitment: "confirmed" }]);
      return BigInt(r.value.amount);
    } catch (e) {
      if (e instanceof SolanaRpcError && /could not find account|invalid param/i.test(e.message)) return 0n;
      throw e;
    }
  }

  /** Raw account: its owner program and data, or null when the account does not exist. */
  async accountInfo(addr: string): Promise<{ owner: string; data: Uint8Array } | null> {
    const r = await this.call<{ value: null | { owner: string; data: [string, string] } }>("getAccountInfo", [addr, { encoding: "base64", commitment: "confirmed" }]);
    return r.value ? { owner: r.value.owner, data: b64ToBytes(r.value.data[0]) } : null;
  }

  async accountData(addr: string): Promise<Uint8Array | null> {
    return (await this.accountInfo(addr))?.data ?? null;
  }

  /**
   * The vault's slot for (NEAR position id, depositor), or null when it was never opened or is already withdrawn. `status` says what it
   * holds: an account in status Settled or Released is not an open deposit (deploy.md). Throws on a slot that is not the program's own.
   */
  async vaultPosition(ids: VaultIds, positionId: bigint, depositor: string): Promise<VaultPosition | null> {
    const vault = await vaultPda(ids.program, ids.mint);
    const info = await this.accountInfo(await positionPda(ids.program, vault, positionId, depositor));
    if (!info) return null;
    if (info.owner !== ids.program) throw new Error("The Position account is not owned by the vault program.");
    const p = decodeVaultPosition(info.data);
    if (p.vault !== vault || p.positionId !== positionId || p.depositor !== depositor) throw new Error("The Position account does not match this vault, position and depositor.");
    return p;
  }

  /** The recipient's pending `Claim`, or null when nothing is owed. Throws on an account that is not the program's own. */
  async vaultClaim(ids: VaultIds, recipient: string): Promise<VaultClaim | null> {
    const vault = await vaultPda(ids.program, ids.mint);
    const info = await this.accountInfo(await claimPda(ids.program, vault, recipient));
    if (!info) return null;
    if (info.owner !== ids.program) throw new Error("The Claim account is not owned by the vault program.");
    const c = decodeVaultClaim(info.data);
    if (c.vault !== vault || c.recipient !== recipient) throw new Error("The Claim account does not match this vault and recipient.");
    return c;
  }

  /** An SPL token account, or null when it does not exist or is not owned by the given token program. */
  async tokenAccount(addr: string, tokenProgram: string = TOKEN_PROGRAM_ADDRESS): Promise<TokenAccountInfo | null> {
    const info = await this.accountInfo(addr);
    return info && info.owner === tokenProgram ? decodeTokenAccount(info.data) : null;
  }

  async rentExemptLamports(bytes: number): Promise<bigint> {
    return BigInt(await this.call<number>("getMinimumBalanceForRentExemption", [bytes]));
  }

  /** "confirmed" | "finalized" | "processed" | "failed" | null (not seen on this cluster). */
  async signatureStatus(signature: string): Promise<"processed" | "confirmed" | "finalized" | "failed" | null> {
    const r = await this.call<{ value: Array<null | { err: unknown; confirmationStatus?: "processed" | "confirmed" | "finalized" }> }>("getSignatureStatuses", [[signature], { searchTransactionHistory: true }]);
    const s = r.value[0];
    if (!s) return null;
    if (s.err) return "failed";
    return s.confirmationStatus ?? "processed";
  }
}

/** Rent-exempt minimum for an account of `bytes` (fallback when the RPC is unavailable): (128 + bytes) · 3480 · 2 lamports. */
export const rentExemptFallback = (bytes: number): bigint => BigInt(128 + bytes) * 3480n * 2n;
