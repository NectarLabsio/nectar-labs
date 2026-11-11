// Allow-list for the same-origin Feed API proxy (/api/indexer/<path>, services/feed/openapi.yaml). Read-only paths only.
// Id segments refuse "." and ".." (R2-11): `new URL(base + "/api/note/..")` would resolve outside the allow-list.
const SEG = (max: number): string => `(?!\\.{1,2}$)[A-Za-z0-9._-]{1,${max}}`;

const ALLOWED: readonly RegExp[] = [
  /^api\/feed$/,
  /^api\/settlements$/,
  /^api\/oneclick$/,
  /^healthz$/,
  new RegExp(`^api/asset/${SEG(32)}$`),
  new RegExp(`^api/note/${SEG(64)}$`),
];

/** Query parameters forwarded (digits only). */
export const FEED_QUERY = ["limit", "position_id"] as const;

/** Joined path segments as Next passes them (already decoded). */
export function isAllowedFeedPath(segments: readonly string[]): boolean {
  if (segments.some((s) => s === "." || s === ".." || s.includes("/"))) return false;
  const p = segments.join("/");
  return ALLOWED.some((r) => r.test(p));
}
