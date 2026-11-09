// Node-only loader for packages/config/config.yaml (services, tests, Next.js server components).
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseConfig, toPublicConfig, type NectarConfigYaml, type PublicConfig } from "./config";

/** Walk up from `start` until `packages/config/config.yaml` exists. */
export function findConfigPath(start: string = process.cwd()): string {
  if (process.env.NECTAR_CONFIG) return resolve(process.env.NECTAR_CONFIG);
  let dir = resolve(start);
  for (;;) {
    const p = join(dir, "packages", "config", "config.yaml");
    if (existsSync(p)) return p;
    const up = dirname(dir);
    if (up === dir) throw new Error(`packages/config/config.yaml not found above ${start}`);
    dir = up;
  }
}

export function loadConfig(start?: string): NectarConfigYaml {
  return parseConfig(readFileSync(findConfigPath(start), "utf8"));
}

export function loadPublicConfig(start?: string): PublicConfig {
  return toPublicConfig(loadConfig(start));
}
