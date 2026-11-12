// Host routing (WO-34a §2, WO-62b). Next 16.4.5 `proxy.ts` (renamed from middleware, Node.js runtime; F-460, F-386). Runs after
// next.config redirects (F-387) and before beforeFiles rewrites. Decisions live in lib/hosts.ts `route()` (unit-tested):
// legacy hosts and /docs 308 out, STATUS `/` is rewritten to /status, cross-host paths 308 to their canonical host.
// Local mode (SITE_URL or APP_URL unset): every request passes through untouched.
import { NextResponse, type NextRequest } from "next/server";
import { readHosts, route } from "./lib/hosts";

const hosts = readHosts();

export function proxy(request: NextRequest) {
  if (!hosts) return NextResponse.next();
  // F-386–F-393, F-401: branch on the Host header (the client domain on Vercel), not nextUrl.hostname.
  const host = request.headers.get("host");
  const r = route(hosts, host, request.nextUrl.pathname, request.nextUrl.search);
  if (r.kind === "next") return NextResponse.next();
  if (r.kind === "rewrite") {
    const to = request.nextUrl.clone();
    to.pathname = r.path;
    return NextResponse.rewrite(to);
  }
  // F-388: NextResponse.redirect(url, 308) keeps the method; F-460: 308 = permanent.
  return NextResponse.redirect(r.location, r.status);
}

export const config = {
  // Build assets never need host routing; everything else (pages, public files, metadata routes) does, for the www and legacy redirects.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
