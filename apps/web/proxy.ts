// Host routing (WO-34a §2). Next 16 `proxy.ts` (renamed from middleware, Node.js runtime; node_modules/next/dist/docs/
// 01-app/03-api-reference/03-file-conventions/proxy.md). Runs after next.config redirects and before beforeFiles rewrites,
// so APP /docs reaches the docs rewrite and SITE /docs is sent to APP first.
// Local mode (SITE_URL or APP_URL unset): every request passes through untouched.
import { NextResponse, type NextRequest } from "next/server";
import { readHosts, route } from "./lib/hosts";

const hosts = readHosts();

export function proxy(request: NextRequest) {
  if (!hosts) return NextResponse.next();
  // F-386–F-393: branch on the Host header (not nextUrl.hostname).
  const host = request.headers.get("host");
  const r = route(hosts, host, request.nextUrl.pathname, request.nextUrl.search);
  if (r.kind === "next") return NextResponse.next();
  return NextResponse.redirect(r.location, r.status);
}

export const config = {
  // Build assets never need host routing; everything else (pages, public files, metadata routes) does, for the www redirect.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
