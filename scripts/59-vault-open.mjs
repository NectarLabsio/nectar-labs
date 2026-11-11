#!/usr/bin/env node
// Borrower-side Solana deposit for a v2 remote position (G7): nectar_vault.open_position(position_id, authority, amount).
// Usage: node scripts/59-vault-open.mjs <program> <mint> <depositor keypair path> <position_id> <authority "ed25519:<b58>"> <amount base units>
//        node scripts/59-vault-open.mjs withdraw <program> <mint> <depositor keypair path> <position_id>   (vault v2: depositor pulls after settle/release)
// The authority is the key NEAR derived for `solana-devnet/pos/<id>` (read from nectar-core-v2 get_position.remote.authority). Devnet only.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'solana/package.json'));
const anchor = require('@coral-xyz/anchor');
const { Connection, Keypair, PublicKey, SystemProgram } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } = require('@solana/spl-token');

const argv = process.argv.slice(2); const mode = argv[0] === 'withdraw' ? argv.shift() : 'open';
const [programArg, mintArg, kpPath, posArg, authArg, amountArg] = argv;
if (mode === 'open' && !amountArg) { console.error('usage: 59-vault-open.mjs <program> <mint> <depositor.json> <position_id> <ed25519:authority> <amount>'); process.exit(2); }
const rpc = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
if (!/devnet|localhost|127\.0\.0\.1/.test(rpc)) { console.error('devnet only'); process.exit(3); }
const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const b58 = (s) => { let n = 0n; for (const c of s) { const i = A.indexOf(c); if (i < 0) throw new Error('bad base58'); n = n * 58n + BigInt(i); }
  let hex = n.toString(16); if (hex.length % 2) hex = '0' + hex; const lead = s.match(/^1*/)[0].length;
  return Buffer.concat([Buffer.alloc(lead), Buffer.from(hex, 'hex')]); };
const authority = mode === 'open' ? b58(authArg.replace(/^ed25519:/, '')) : null;
if (mode === 'open' && authority.length !== 32) throw new Error(`authority length ${authority.length}`);
const conn = new Connection(rpc, 'confirmed');
const depositor = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(kpPath, 'utf8'))));
const programId = new PublicKey(programArg); const mint = new PublicKey(mintArg);
const idl = JSON.parse(readFileSync(join(root, 'solana/target/idl/nectar_vault.json'), 'utf8')); idl.address = programId.toBase58();
const program = new anchor.Program(idl, new anchor.AnchorProvider(conn, new anchor.Wallet(depositor), { commitment: 'confirmed' }));
const pos = new anchor.BN(posArg);
const [vault] = PublicKey.findProgramAddressSync([Buffer.from('vault'), mint.toBuffer()], programId);
const [vaultTokens] = PublicKey.findProgramAddressSync([Buffer.from('tokens'), vault.toBuffer()], programId);
const [position] = PublicKey.findProgramAddressSync([Buffer.from('pos'), vault.toBuffer(), pos.toArrayLike(Buffer, 'le', 8), depositor.publicKey.toBuffer()], programId);
const depositorTokens = getAssociatedTokenAddressSync(mint, depositor.publicKey);
if (mode === 'withdraw') {
  const w = await program.methods.withdraw(pos)
    .accountsPartial({ depositor: depositor.publicKey, vault, mint, vaultTokens, position, destination: depositorTokens, tokenProgram: TOKEN_PROGRAM_ID })
    .rpc();
  console.log(JSON.stringify({ position_pda: position.toBase58(), withdrawn_to: depositorTokens.toBase58(), solana_tx: w }));
  process.exit(0);
}
const sig = await program.methods.openPosition(pos, [...authority], new anchor.BN(amountArg))
  .accountsPartial({ depositor: depositor.publicKey, vault, mint, vaultTokens, depositorTokens, position, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId })
  .rpc();
console.log(JSON.stringify({ position_pda: position.toBase58(), depositor: depositor.publicKey.toBase58(), solana_tx: sig }));
