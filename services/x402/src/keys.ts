// Full-access key loading for the x402 relayer and the demo agent (F-328: function-call keys cannot authorize
// the delegated ft_transfer). Same file format and 0600 rule as the keeper (services/keeper/src/keyfile.ts):
// a near-cli credentials JSON with `private_key`. Errors name the env variable, never the key or its contents.

import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { KeyFileError, loadKeeperKey, loadSecretFile } from '../../keeper/src/keyfile.ts';

export { KeyFileError };

export interface LoadedKey {
  accountId: string;
  secretKey: `ed25519:${string}`;
}

const home = (p: string): string => (p.startsWith('~/') ? resolve(homedir(), p.slice(2)) : resolve(p));

/** Printable ASCII with no spaces, so it is safe in a header; at least 32 characters (`openssl rand -hex 32`). */
const SHARED_SECRET_RE = /^[\x21-\x7e]{32,}$/;

/** Bearer token for the HTTP facilitator, from the 0600 file at `envName`. Errors never carry its contents. */
export function loadSharedSecret(path: string | null | undefined, envName: string): string {
  if (path === null || path === undefined || path.trim() === '' || path.startsWith('TODO-')) {
    throw new KeyFileError(`${envName} is not set: point it at a 0600 file holding the facilitator shared secret`);
  }
  const secret = loadSecretFile(home(path), envName);
  if (!SHARED_SECRET_RE.test(secret)) throw new KeyFileError(`${envName} file must hold one token of at least 32 printable characters with no spaces`);
  return secret;
}

/** `envName` holds a path; `accountId` must match the file's account_id when the file has one. */
export function loadFullAccessKey(path: string | null | undefined, envName: string, accountId: string, accountEnvName: string): LoadedKey {
  if (path === null || path === undefined || path.trim() === '' || path.startsWith('TODO-')) {
    throw new KeyFileError(`${envName} is not set: point it at a 0600 near-cli credentials file for ${accountId} (full-access key)`);
  }
  const k = loadKeeperKey(home(path), accountId, envName, accountEnvName);
  return { accountId, secretKey: k.secretKey };
}
