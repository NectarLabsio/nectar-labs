// Ed25519 native-program verify instruction, built by hand (F-082; kit 8.6.0 has no helper, F-186).
// Layout = solana `new_ed25519_instruction_with_signature`, which nectar_vault accepts and nothing else:
//   [num_signatures=1 u8, padding=0 u8]
//   Ed25519SignatureOffsets (7 x u16 LE): signature_offset=48, signature_instruction_index=0xFFFF,
//     public_key_offset=16, public_key_instruction_index=0xFFFF, message_data_offset=112,
//     message_data_size=len(message), message_instruction_index=0xFFFF
//   pubkey (32 B) @16 · signature (64 B) @48 · message @112. No accounts.
// No runtime dependencies: the kit types are type-only imports, so the keeper (WO-16) can import this file directly.
import type { Address, Instruction } from "@solana/kit";

export const ED25519_PROGRAM_ADDRESS = "Ed25519SigVerify111111111111111111111111111" as Address;
export const INSTRUCTIONS_SYSVAR_ADDRESS = "Sysvar1nstructions1111111111111111111111111" as Address;

export const ED25519_PUBKEY_OFFSET = 16;
export const ED25519_SIGNATURE_OFFSET = 48;
export const ED25519_MESSAGE_OFFSET = 112;
const THIS_INSTRUCTION = 0xffff;

/** Instruction data for one signature, all offsets pointing into this instruction. */
export function ed25519InstructionData(publicKey: Uint8Array, signature: Uint8Array, message: Uint8Array): Uint8Array {
  if (publicKey.length !== 32) throw new Error(`ed25519: public key must be 32 bytes, got ${publicKey.length}`);
  if (signature.length !== 64) throw new Error(`ed25519: signature must be 64 bytes, got ${signature.length}`);
  if (message.length > 0xffff - ED25519_MESSAGE_OFFSET) throw new Error("ed25519: message too long");
  const data = new Uint8Array(ED25519_MESSAGE_OFFSET + message.length);
  const view = new DataView(data.buffer);
  data[0] = 1; // num_signatures
  data[1] = 0; // padding
  const offsets = [
    ED25519_SIGNATURE_OFFSET,
    THIS_INSTRUCTION,
    ED25519_PUBKEY_OFFSET,
    THIS_INSTRUCTION,
    ED25519_MESSAGE_OFFSET,
    message.length,
    THIS_INSTRUCTION,
  ];
  offsets.forEach((v, i) => view.setUint16(2 + 2 * i, v, true));
  data.set(publicKey, ED25519_PUBKEY_OFFSET);
  data.set(signature, ED25519_SIGNATURE_OFFSET);
  data.set(message, ED25519_MESSAGE_OFFSET);
  return data;
}

/** A `@solana/kit` instruction; place it immediately before `settle` / `release` in the same transaction. */
export function ed25519VerifyInstruction(
  publicKey: Uint8Array,
  signature: Uint8Array,
  message: Uint8Array,
): Instruction<string> & { data: Uint8Array } {
  return { programAddress: ED25519_PROGRAM_ADDRESS, accounts: [], data: ed25519InstructionData(publicKey, signature, message) };
}

/** Hex helper for NEAR `settlement_signed` / `remote_release_signed` payloads. */
export function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (h.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(h)) throw new Error("hexToBytes: invalid hex");
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(2 * i, 2 * i + 2), 16);
  return out;
}
