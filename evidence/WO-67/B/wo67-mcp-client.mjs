// WO-67 G9: minimal MCP JSON-RPC client. Usage: node wo67-mcp-client.mjs stdio | http <url>
import { spawn } from "node:child_process";
const mode = process.argv[2];
const msgs = [
  { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "wo67-verifier", version: "0" } } },
  { jsonrpc: "2.0", method: "notifications/initialized" },
  { jsonrpc: "2.0", id: 2, method: "tools/list" },
  { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_exit_capacity", arguments: { symbol: "NVDAx" } } },
];
const show = (r) => {
  if (r.id === 1) console.log("initialize:", JSON.stringify(r.result?.serverInfo ?? r.error));
  if (r.id === 2) console.log("tools/list:", r.result?.tools?.length, (r.result?.tools ?? []).map((t) => t.name).join(","));
  if (r.id === 3) console.log("get_exit_capacity:", (r.result?.content?.[0]?.text ?? JSON.stringify(r.error)).slice(0, 400));
};
if (mode === "stdio") {
  const p = spawn("pnpm", ["-s", "--filter", "feed", "mcp"], { cwd: new URL("../..", import.meta.url).pathname, stdio: ["pipe", "pipe", "inherit"] });
  let buf = "", got = 0;
  p.stdout.on("data", (d) => {
    buf += d; let i;
    while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); try { const r = JSON.parse(line); show(r); if (r.id) got++; if (got === 3) p.kill(); } catch {} }
  });
  for (const m of msgs) p.stdin.write(JSON.stringify(m) + "\n");
  setTimeout(() => { console.log("timeout"); p.kill(); process.exit(1); }, 60000).unref();
} else {
  const url = process.argv[3]; let sid;
  for (const m of msgs) {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(sid ? { "mcp-session-id": sid } : {}) }, body: JSON.stringify(m) });
    sid = r.headers.get("mcp-session-id") ?? sid;
    const t = await r.text();
    if (!m.id) { console.log("notification:", r.status); continue; }
    const j = t.trim().startsWith("{") ? t : t.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5)).pop();
    try { show(JSON.parse(j)); } catch { console.log("raw", r.status, t.slice(0, 200)); }
  }
}
