// Full-access key loading for the x402 relayer and the demo agent (F-328: function-call keys cannot authorize
// the delegated ft_transfer). Same file format and 0600 rule as the keeper (services/keeper/src/keyfile.ts):
// a near-cli credentials JSON with `private_key`. Errors name the env variable, never the key or its contents.

import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { KeyFileError, loadKeeperKey } from '../../keeper/src/keyfile.ts';

export { KeyFileError };

export interface LoadedKey {
  accountId: string;
  secretKey: `ed25519:${string}`;
}

const home = (p: string): string => (p.startsWith('~/') ? resolve(homedir(), p.slice(2)) : resolve(p));

/** `envName` holds a path; `accountId` must match the file's account_id when the file has one. */
export function loadFullAccessKey(path: string | null | undefined, envName: string, accountId: string, accountEnvName: string): LoadedKey {
  if (path === null || path === undefined || path.trim() === '' || path.startsWith('TODO-')) {
    throw new KeyFileError(`${envName} is not set: point it at a 0600 near-cli credentials file for ${accountId} (full-access key)`);
  }
  const k = loadKeeperKey(home(path), accountId, envName, accountEnvName);
  return { accountId, secretKey: k.secretKey };
}
