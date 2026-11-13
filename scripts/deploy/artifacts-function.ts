// Nectar Labs deploy artifacts: a Railway Function, Bun, one file (WO-34m, docs/process/work/wo-34m-mcp-deploy.md). Orchestrator-deployed only.
// It issues short-lived presigned URLs for one private bucket, so a source tarball can move local → bucket → Vercel build / Railway Feed without
// its bytes passing through a tool argument. It never handles a chain key of any kind.
//
// Variables (Railway):
//   S3_* are reference variables to the bucket (${{artifacts-bucket.*}}), so the bucket secret never leaves Railway.
//   ARTIFACT_TOKEN_SHA256 is the hex sha256 of the bearer token. The token itself stays in ~/.nectar/deploy/artifact-token (0600) on the operator's machine.
// Routes:
//   GET  /health → 200 {"ok":true}
//   POST /presign {op:"put"|"get", key, expires?} with Authorization: Bearer <token>
//        put → URL valid 900 s; get → URL valid min(expires ?? 3600, 30 days) s. The body is the URL as text/plain.
// Keys must match ^src-[0-9a-f]{40}\.tar\.gz$. Anything else is 400; a missing or wrong token is 401.
import { S3Client } from "bun";
import { timingSafeEqual } from "node:crypto";

const env = Bun.env;
// C-024: with virtualHostedStyle the Bun client ignores `bucket` and uses `endpoint` as the bucket host, while Railway hands out the base endpoint
// (F-416). So the bucket host is built here. S3_URL_STYLE=path switches to path style (older buckets, F-416).
const pathStyle = env.S3_URL_STYLE === "path";
const base = new URL(env.S3_ENDPOINT ?? "https://t3.storageapi.dev");
const s3 = new S3Client({
  accessKeyId: env.S3_ACCESS_KEY_ID,
  secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  bucket: env.S3_BUCKET,
  endpoint: pathStyle ? base.origin : `${base.protocol}//${env.S3_BUCKET}.${base.host}`,
  region: env.S3_REGION,
  virtualHostedStyle: !pathStyle,
}); // F-419 option names; F-420 presign(path, {method, expiresIn}) → string.
const TOKEN_SHA256 = (env.ARTIFACT_TOKEN_SHA256 ?? "").toLowerCase();
const KEY = /^src-[0-9a-f]{40}\.tar\.gz$/;
const PUT_S = 900;
const GET_DEFAULT_S = 3600;
const GET_MAX_S = 30 * 24 * 3600; // Railway caps presigned URLs at 90 days (F-414).

const json = (status: number, body: unknown) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

function authorized(req: Request): boolean {
  const h = req.headers.get("authorization") ?? "";
  if (!h.startsWith("Bearer ") || !/^[0-9a-f]{64}$/.test(TOKEN_SHA256)) return false;
  const digest = new Bun.CryptoHasher("sha256").update(h.slice(7)).digest("hex");
  return timingSafeEqual(Buffer.from(digest), Buffer.from(TOKEN_SHA256));
}

Bun.serve({
  port: Number(env.PORT ?? 3000),
  async fetch(req) {
    const { pathname } = new URL(req.url);
    if (req.method === "GET" && pathname === "/health") return json(200, { ok: true });
    if (req.method !== "POST" || pathname !== "/presign") return json(404, { error: "not found" });
    if (!authorized(req)) return json(401, { error: "unauthorized" });
    let body: { op?: unknown; key?: unknown; expires?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return json(400, { error: "body must be JSON" });
    }
    const { op, key, expires } = body;
    if (typeof key !== "string" || !KEY.test(key)) return json(400, { error: "bad key" });
    if (op === "put") return new Response(s3.presign(key, { method: "PUT", expiresIn: PUT_S }), { headers: { "cache-control": "no-store" } });
    if (op === "get") {
      const s = typeof expires === "number" && Number.isInteger(expires) && expires > 0 ? Math.min(expires, GET_MAX_S) : GET_DEFAULT_S;
      return new Response(s3.presign(key, { method: "GET", expiresIn: s }), { headers: { "cache-control": "no-store" } });
    }
    return json(400, { error: "bad op" });
  },
});
