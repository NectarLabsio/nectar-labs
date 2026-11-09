// Loads the keeper's function-call key from a 0600 JSON file (path from KEEPER_KEY_PATH).
// Accepted shape (near-cli credentials file): {"account_id": "...", "public_key": "ed25519:...",
// "private_key": "ed25519:..."}; `secret_key` is accepted as an alias. The file must not be readable
// by group/other. The key material never leaves this module except as an opaque signer string.

import { readFileSync, statSync } from 'node:fs';

export interface KeeperKey {
  accountId: string | null;
  publicKey: string | null;
  /** `ed25519:<base58>`; handed straight to the signer, never logged. */
  secretKey: `ed25519:${string}`;
}

export class KeyFileError extends Error {}

/** Reads a 0600 text secret (e.g. an API key) — same permission rule as key files; never logged. */
export function loadSecretFile(path: string, envName: string): string {
  let st;
  try {
    st = statSync(path);
  } catch {
    throw new KeyFileError(`secret file not found at ${envName}`);
  }
  if (!st.isFile()) throw new KeyFileError(`${envName} is not a regular file`);
  if (process.platform !== 'win32' && (st.mode & 0o077) !== 0) {
    throw new KeyFileError(`${envName} file mode ${(st.mode & 0o777).toString(8)} is too open; chmod 600`);
  }
  const v = readFileSync(path, 'utf8').trim();
  if (v === '') throw new KeyFileError(`${envName} file is empty`);
  return v;
}

export function loadKeeperKey(path: string, expectedAccountId?: string, envName = 'KEEPER_KEY_PATH', accountEnvName = 'KEEPER_ACCOUNT_ID'): KeeperKey {
  let st;
  try {
    st = statSync(path);
  } catch {
    throw new KeyFileError(`key file not found at ${envName}`);
  }
  if (!st.isFile()) throw new KeyFileError(`${envName} is not a regular file`);
  if (process.platform !== 'win32' && (st.mode & 0o077) !== 0) {
    throw new KeyFileError(`key file mode ${(st.mode & 0o777).toString(8)} is too open; chmod 600`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new KeyFileError('key file is not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null) throw new KeyFileError('key file is not a JSON object');
  const o = parsed as Record<string, unknown>;
  const sk = typeof o.private_key === 'string' ? o.private_key : typeof o.secret_key === 'string' ? o.secret_key : null;
  if (sk === null || !sk.startsWith('ed25519:')) throw new KeyFileError('key file has no ed25519 private_key');
  const accountId = typeof o.account_id === 'string' ? o.account_id : null;
  if (expectedAccountId !== undefined && accountId !== null && accountId !== expectedAccountId) {
    throw new KeyFileError(`key file account_id ${accountId} != ${accountEnvName} ${expectedAccountId}`);
  }
  return {
    accountId,
    publicKey: typeof o.public_key === 'string' ? o.public_key : null,
    secretKey: sk as `ed25519:${string}`,
  };
}
