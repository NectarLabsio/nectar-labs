// Independent PDA reference for the vault_read job (WO-24): @solana/kit getProgramDerivedAddress.
// Usage: NODE_PATH=<dir containing @solana/kit> node quoter/tests/pda_kit.cjs > quoter/tests/pda_kit.json
// (generated with @solana/kit 8.6.0 from the repo's pnpm store; tests/jobs.rs checks the Rust derivation against it).
const { getProgramDerivedAddress, getAddressEncoder, address } = require('@solana/kit');

const PROGRAM = 'ENZaNFHosYeNhsjC85K73feMFwX4w8i1dzuhQ3PzpubW'; // packages/config/config.yaml solana.vault_program
const MINTS = ['3Ve8GiDBtD7crfwUcKukpMigKQaU2aXtSCNgu661E8hT', 'So11111111111111111111111111111111111111112'];
const IDS = [...Array(48).keys()].map(BigInt).concat([1000003n, 4294967296n, 18446744073709551615n]);
// The Ed25519 base point (on the curve, as interface-v7 §E requires) and a second key, so the seeds must bind the depositor.
const DEPOSITORS = ['6x5SYnLroiN7WYq8NQYU9KHcH4YjpBbwpUfVu3EB7ieH', '4wBqpZM9xaSheZzJSMawUKKwhdpChKbZ5eu5ky4Vigw'];

function u64le(n) {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, n, true);
  return b;
}

(async () => {
  const enc = getAddressEncoder();
  const out = { tool: '@solana/kit getProgramDerivedAddress', program: PROGRAM, vaults: [] };
  for (const mint of MINTS) {
    const [vault, vault_bump] = await getProgramDerivedAddress({
      programAddress: address(PROGRAM),
      seeds: ['vault', enc.encode(address(mint))],
    });
    const positions = [];
    for (const depositor of DEPOSITORS) {
      for (const id of IDS) {
        const [pda, bump] = await getProgramDerivedAddress({
          programAddress: address(PROGRAM),
          seeds: ['pos', enc.encode(vault), u64le(id), enc.encode(address(depositor))],
        });
        positions.push({ id: id.toString(), depositor, pda, bump });
      }
    }
    out.vaults.push({ mint, vault, vault_bump, positions });
  }
  process.stdout.write(JSON.stringify(out, null, 1) + '\n');
})();
