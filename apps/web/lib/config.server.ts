import { loadPublicConfig } from "@nectar/sdk/config-node";
import type { PublicConfig } from "@nectar/sdk";

let cached: PublicConfig | null = null;

/** packages/config/config.yaml, read on the server (build or request) and passed to the client as plain data. */
export function getPublicConfig(): PublicConfig {
  if (!cached) cached = loadPublicConfig(process.cwd());
  return cached;
}
