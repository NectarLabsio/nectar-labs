# WO-53r — researcher — zod advisory via @x402/core; C-020 status (< 30 min; FACTS only)
`pnpm audit --prod` reports GHSA-mrhx-c7xc-m3w5, high, zod < 4.6.6, "Zod can exhaust memory while validating oversized constrained collections", path
services/x402 > @x402/core@2.18.0 > zod (3.x; @x402/core requires ^3.24.2). Kunal asks: advisory ID, severity, and whether our code path reaches it.
1. Verify the advisory from its primary page (GitHub advisory DB / zod repo): ID, CVE if any, severity + CVSS vector, affected/patched ranges (is any 3.x
   patched?), the vulnerable construct (which schema kinds / methods).
2. Reachability: grep node_modules/@x402/core (the installed version) for zod schemas of the vulnerable kind and find which of them parse **untrusted input**
   in OUR server path (services/x402/src: the paid route parses the client's payment header / body; the facilitator call). Note input bounds that apply
   (Node http max header size default, any body cap). Verdict: reachable / reachable-but-bounded / not reachable, with file:line evidence.
3. Add F-entries (date, URL, quote). Update FACTS C-020: decided by Kunal 2026-11-11 — keep current behaviour (SECURITY.md known limitation).
Commit `docs: FACTS — zod GHSA-mrhx-c7xc-m3w5 reachability; C-020 decided` (no Co-Authored-By, never --no-verify). Report ≤ 8 lines.
