// WO-62c "Get test assets": where the button may appear. Pure, so node:test covers the host rule without a hosted build.
import { isLandingPath, readHosts } from "./hosts.ts";

/**
 * The testnet app only: local single-host mode, the APP host, and unknown hosts (previews), which route() serves exactly like local mode.
 * Never on the SITE host and never on a landing path (landing paths are SITE content in hosted mode).
 * `env` takes the inlined NEXT_PUBLIC_SITE_URL / NEXT_PUBLIC_APP_URL; `host` is window.location.host.
 */
export function testAssetsAllowed(env: { SITE_URL?: string; APP_URL?: string }, host: string | null | undefined, pathname: string): boolean {
  if (isLandingPath(pathname || "/")) return false;
  const h = readHosts({ SITE_URL: env.SITE_URL, APP_URL: env.APP_URL });
  if (!h) return true;
  if (!host) return false;
  return host.trim().toLowerCase() !== h.siteHost;
}
