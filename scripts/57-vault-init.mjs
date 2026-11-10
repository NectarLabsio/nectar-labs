#!/usr/bin/env node
// init_vault("NVDAx") on devnet for the deployed nectar_vault (solana/deploy.md). Usage: node scripts/57-vault-init.mjs <program> <mint> <payer keypair path>
// Uses solana/node_modules (@coral-xyz/anchor 0.32.1) and the IDL from `anchor build`. Idempotent: exits 0 if the vault PDA already exists.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'solana/package.json'));
const anchor = require('@coral-xyz/anchor');
const { Connection, Keypair, PublicKey, SystemProgram } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');

const [programArg, mintArg, payerPath] = process.argv.slice(2);
if (!programArg || !mintArg || !payerPath) { console.error('usage: 57-vault-init.mjs <program> <mint> <payer.json>'); process.exit(2); }
const conn = new Connection(process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com', 'confirmed');
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(payerPath, 'utf8'))));
const programId = new PublicKey(programArg); const mint = new PublicKey(mintArg);
const idl = JSON.parse(readFileSync(join(root, 'solana/target/idl/nectar_vault.json'), 'utf8'));
idl.address = programId.toBase58();
const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(payer), { commitment: 'confirmed' });
const program = new anchor.Program(idl, provider);
const [vault] = PublicKey.findProgramAddressSync([Buffer.from('vault'), mint.toBuffer()], programId);
const [vaultTokens] = PublicKey.findProgramAddressSync([Buffer.from('tokens'), vault.toBuffer()], programId);
if (await conn.getAccountInfo(vault)) { console.log(JSON.stringify({ vault: vault.toBase58(), vault_ata: vaultTokens.toBase58(), status: 'exists' })); process.exit(0); }
// Account names come from the IDL (anchor resolves PDAs it can derive); pass the ones it cannot.
const sig = await program.methods.initVault('NVDAx')
  .accountsPartial({ payer: payer.publicKey, mint, vault, vaultTokens, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId })
  .rpc();
console.log(JSON.stringify({ vault: vault.toBase58(), vault_ata: vaultTokens.toBase58(), tx: sig, explorer: `https://explorer.solana.com/tx/${sig}?cluster=devnet` }));
