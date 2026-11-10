G9 rehearsal (pre-check), NOT the G9 gate. Clone /tmp/verify-G9pre-1794270192 of /Volumes/T7/nectar-labs @ 5cd7364 (main), 2026-11-10T00:23:13Z.
PATH=$HOME/.cargo/bin:$HOME/.local/bin:$PATH. FEED_DB_PATH pointed at a scratch dir for feed runs (to avoid writing ~/.nectar).
01 pnpm i · 02 pnpm demo:testnet · 03 pnpm verify · 04 docs-site build · 05 web dev (/ and /feed 200) · 06 docs-site start
07 gitleaks · 08 RPC/GET spot checks · 09/10 Feed MCP stdio (no env / CORE_ACCOUNT_ID) · 11/12 Feed start + MCP HTTP + REST
