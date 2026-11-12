#!/usr/bin/env node
// D1 (Kunal 2026-11-12): a fresh testnet account for the demo recording. Orchestrator-run only.
// Generates a BIP39 12-word phrase (near-api-js 7.4.0 `near-api-js/seed-phrase`, path m/44'/397'/0', F-461 report / WO-60 note) and writes
// {account_id, public_key, private_key, seed_phrase, hd_path} to ~/.nectar/keys/<account>.json with mode 0600 (dir 0700).
// Prints ONLY the account id and the public key. The phrase is never printed or logged; Kunal reads it in his own terminal:
//   node -e 'console.log(require(process.env.HOME + "/.nectar/keys/<account>.json").seed_phrase)'
// Then: near account create-account fund-myself <account> '<NEAR>' use-manually-provided-public-key <pk> sign-as <owner> network-config testnet sign-with-keychain send
// Usage: node scripts/ops/create-demo-account.mjs <account_id>
import { createRequire } from "node:module";
import { existsSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const account = process.argv[2];
if (!account || !/^[a-z0-9._-]+\.testnet$/.test(account)) {
  console.error("usage: create-demo-account.mjs <account>.testnet");
  process.exit(2);
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const req = createRequire(join(root, "services/keeper/package.json"));
const { generateSeedPhrase } = await import(pathToFileURL(req.resolve("near-api-js/seed-phrase")).href);

const dir = join(homedir(), ".nectar", "keys");
const file = join(dir, `${account}.json`);
if (existsSync(file)) {
  console.error(`refusing to overwrite ${file}`);
  process.exit(3);
}
mkdirSync(dir, { recursive: true, mode: 0o700 });
const { seedPhrase, keyPair } = generateSeedPhrase();
const public_key = keyPair.getPublicKey().toString();
const private_key = keyPair.toString();
writeFileSync(file, JSON.stringify({ account_id: account, public_key, private_key, seed_phrase: seedPhrase, hd_path: "m/44'/397'/0'" }, null, 2) + "\n", { mode: 0o600 });
chmodSync(file, 0o600);
console.log(JSON.stringify({ account_id: account, public_key, key_file: file.replace(homedir(), "~") }));
