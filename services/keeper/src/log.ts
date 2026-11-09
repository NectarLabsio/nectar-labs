// JSON-lines logger to stdout. Privacy rule: never log request IPs, user agents or any field that
// could join a wallet to a network address. Callers pass structured fields; this module strips the
// known-dangerous keys defensively.

export type Level = 'debug' | 'info' | 'warn' | 'error';

export type LogFields = Record<string, string | number | boolean | null | undefined>;

export interface Logger {
  log(level: Level, msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  debug(msg: string, fields?: LogFields): void;
}

const FORBIDDEN = new Set(['ip', 'remote_addr', 'remoteAddress', 'x_forwarded_for', 'user_agent', 'private_key', 'secret_key']);

export function createLogger(service: string, sink: (line: string) => void = (l) => process.stdout.write(l + '\n')): Logger {
  const log = (level: Level, msg: string, fields: LogFields = {}): void => {
    const out: Record<string, string | number | boolean | null> = { ts: new Date().toISOString(), level, service, msg };
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined || FORBIDDEN.has(k)) continue;
      out[k] = v;
    }
    sink(JSON.stringify(out));
  };
  return {
    log,
    info: (m, f) => log('info', m, f),
    warn: (m, f) => log('warn', m, f),
    error: (m, f) => log('error', m, f),
    debug: (m, f) => log('debug', m, f),
  };
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
