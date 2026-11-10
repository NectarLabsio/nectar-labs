// Zero-config defaults for a fresh clone: account ids from packages/config/config.yaml (accounts.core,
// usdc_mock, nvdax_mock, keeper; collateral.nvdax.token). Environment variables still override. Only
// indented `key: scalar` lines are read (no YAML dependency); NECTAR_CONFIG_PATH points elsewhere.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface RepoIds {
  core: string | null;
  usdcMock: string | null;
  nvdaxMock: string | null;
  keeper: string | null;
  nvdaxToken: string | null;
}

const DEFAULT_PATH = fileURLToPath(new URL('../../../packages/config/config.yaml', import.meta.url));
const placeholder = (v: string | undefined): boolean => v === undefined || v.trim() === '' || v.startsWith('TODO-') || v === 'null';

/** Flattens indented `key: value` scalars into dotted paths (`accounts.core` -> value). Comments stripped. */
export function flattenYaml(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const stack: Array<{ indent: number; key: string }> = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/^\s*#.*$/, '').replace(/\s+#.*$/, '');
    const m = /^( *)([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
    if (m === null) continue;
    const indent = (m[1] ?? '').length;
    const key = m[2] ?? '';
    while (stack.length > 0 && (stack[stack.length - 1]?.indent ?? -1) >= indent) stack.pop();
    const path = [...stack.map((s) => s.key), key].join('.');
    const value = (m[3] ?? '').trim().replace(/^"(.*)"$/, '$1');
    if (value === '') stack.push({ indent, key });
    else out.set(path, value);
  }
  return out;
}

export function loadRepoIds(env: NodeJS.ProcessEnv = process.env): RepoIds {
  const path = placeholder(env.NECTAR_CONFIG_PATH) ? DEFAULT_PATH : (env.NECTAR_CONFIG_PATH as string);
  let flat = new Map<string, string>();
  try {
    flat = flattenYaml(readFileSync(path, 'utf8'));
  } catch {
    // no config file (e.g. copied out of the repo): env only
  }
  const pick = (envKey: string, yamlKey: string): string | null => {
    const fromEnv = env[envKey];
    if (!placeholder(fromEnv)) return fromEnv as string;
    const v = flat.get(yamlKey);
    return placeholder(v) ? null : (v as string);
  };
  return {
    core: pick('CORE_ACCOUNT_ID', 'accounts.core'),
    usdcMock: pick('USDC_ACCOUNT_ID', 'accounts.usdc_mock'),
    nvdaxMock: pick('NVDAX_ACCOUNT_ID', 'accounts.nvdax_mock'),
    keeper: pick('KEEPER_ACCOUNT_ID', 'accounts.keeper'),
    nvdaxToken: pick('NVDAX_TOKEN_ID', 'collateral.nvdax.token'),
  };
}
