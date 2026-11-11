// Hosted-mode settings (WO-34k): single public port, start block, version. Pure functions of env so tests cover
// them; local defaults (REST 127.0.0.1:8788, MCP :8789, start at the Neardata head) are unchanged when unset.

import { readFileSync } from 'node:fs';

export class HostedConfigError extends Error {}

const blank = (v: string | undefined): boolean => v === undefined || v.trim() === '' || v.startsWith('TODO-');

export interface Listen {
  /** true: REST + `POST /mcp` on one server (FEED_SINGLE_PORT=1). */
  single: boolean;
  port: number;
  host: string;
  /** Dedicated MCP port, or null (off, or folded into `port` in single-port mode). */
  mcpPort: number | null;
}

function tcpPort(v: string, name: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new HostedConfigError(`${name} must be a TCP port`);
  return n;
}

export function listenConfig(env: NodeJS.ProcessEnv): Listen {
  const host = blank(env.FEED_HOST) ? '127.0.0.1' : (env.FEED_HOST as string);
  const single = env.FEED_SINGLE_PORT === '1';
  if (single) {
    // The platform injects PORT; FEED_PORT is the local fallback.
    const fromPort = !blank(env.PORT);
    return { single, port: tcpPort(fromPort ? (env.PORT as string) : (env.FEED_PORT ?? '8788'), fromPort ? 'PORT' : 'FEED_PORT'), host, mcpPort: null };
  }
  const mcp = env.FEED_MCP_PORT ?? '8789';
  return { single, port: tcpPort(env.FEED_PORT ?? '8788', 'FEED_PORT'), host, mcpPort: mcp === 'off' ? null : tcpPort(mcp, 'FEED_MCP_PORT') };
}

/** Neardata start on an empty DB: absolute height, or `back` blocks behind the final head (0 = the head itself). */
export type StartBlock = { kind: 'height'; height: number } | { kind: 'head'; back: number };

/** FEED_START_BLOCK = `head` | `head-N` | <height>; else FEED_NEARDATA_START_HEIGHT (<height>); else `head`. */
export function startBlock(env: NodeJS.ProcessEnv): StartBlock {
  const raw = !blank(env.FEED_START_BLOCK)
    ? (env.FEED_START_BLOCK as string).trim()
    : blank(env.FEED_NEARDATA_START_HEIGHT)
      ? 'head'
      : (env.FEED_NEARDATA_START_HEIGHT as string).trim();
  if (raw === 'head') return { kind: 'head', back: 0 };
  const rel = /^head-(\d{1,9})$/.exec(raw);
  if (rel !== null) return { kind: 'head', back: Number(rel[1]) };
  if (/^\d{1,15}$/.test(raw)) return { kind: 'height', height: Number(raw) };
  throw new HostedConfigError('FEED_START_BLOCK must be head, head-N or a block height');
}

export const startBlockLabel = (s: StartBlock): string => (s.kind === 'height' ? String(s.height) : s.back === 0 ? 'head' : `head-${s.back}`);

export function feedVersion(env: NodeJS.ProcessEnv): { version: string; commit: string | null } {
  let version = '0.0.0';
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version?: unknown };
    if (typeof pkg.version === 'string') version = pkg.version;
  } catch {
    // packaged without package.json
  }
  const sha = env.NECTAR_GIT_SHA;
  return { version, commit: blank(sha) || !/^[0-9a-f]{7,40}$/i.test(sha as string) ? null : (sha as string) };
}
