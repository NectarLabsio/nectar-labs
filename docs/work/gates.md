# gates.md — exact commands the verifier runs (fresh clone, no secrets)

Each gate: `git clone <repo> /tmp/verify-<G>-$(date +%s) && cd $_ && pnpm i --frozen-lockfile`, then:

G0: rustc --version; cargo --version; cargo near --version; near --version; node -v; pnpm -v; anchor --version; solana --version;
    near account create-account --help | head -40; near account add-key --help | head -40;
    curl -s https://1click.chaindefuser.com/v0/tokens | head -c 400;
    curl -s "https://pyth.dourolabs.app/hermes/v2/updates/price/latest?ids[]=$NVDA_PRICE_ID" | head -c 400
    PASS: all recorded in FACTS with today's date; F-020 resolved.
G1: cargo test -p nectar-core 2>&1 | tail -40; cargo test -p nectar-core --test sandbox 2>&1 | tail -40;
    python3 contracts/nectar-core/tests/model.py --check
G2: scripts/50-verify.sh (read-only views against config.yaml ids) ; open explorer links with WebFetch
G3: pnpm --filter web build 2>&1 | tail -40; PW_CHANNEL=chrome pnpm --filter web e2e 2>&1 | tail -40; LH_START=1 pnpm --filter web lighthouse (a11y ≥ 90, 6 routes × 2 themes)
G4: RPC view outlayer.testnet estimate_execution_cost with packages/config/outlayer-limits.json; bash quoter/build.sh → sha256 == config
    outlayer.version_key == sha256(GET outlayer.wasm_url); nectar-core get_quoter_config / get_state_version / code_hash vs rebuilt wasm;
    trigger txs from evidence/G4/run-*.log via EXPERIMENTAL_tx_status → quoter_result disc_bps within [0, quote max] (run B) and
    quoter_fallback (run A); attestation GET https://testnet-api.outlayer.ai/attestations/by-request/<request_id> (F-168/F-169).
G5: near contract call-function as-read-only $ORACLE get_price json-args '{"price_identifier":"'$NVDA_PRICE_ID'"}' network-config testnet now → publish_time < 600 s old; cargo test -p nectar-core oracle_rejects
G6: pnpm --filter keeper test:oneclick (dry quote + verifyQuoteSignature) ; Feed shows R_c or "no 1Click route"
G7: cd solana && anchor test 2>&1 | tail -40; pnpm --filter keeper test:settle-devnet (uses config program id); open both explorer links
G8: pnpm --filter web test:copilot (fixture) [+ --live if NEAR_AI_API_KEY present]
G9: follow README.md top to bottom in ≤ 15 min; pnpm demo:testnet; pnpm verify; pnpm --filter docs-site build; gitleaks detect --log-opts=--all

Host notes (2026-11-10): tools live in $HOME/.cargo/bin and $HOME/.local/bin (export PATH). On this Mac, Rust linking needs
SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk (scripts/_lib.sh sets it). Clone source for the verifier is the
local repo: `git clone /Volumes/T7/nectar-labs <tmp>` (no remote exists; never push). Playwright uses PW_CHANNEL=chrome.
