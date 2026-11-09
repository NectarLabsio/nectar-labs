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
G3: pnpm --filter web build 2>&1 | tail -40; pnpm --filter web e2e 2>&1 | tail -40; pnpm --filter web lighthouse (a11y ≥ 90)
G4: near contract call-function as-read-only outlayer.testnet estimate_execution_cost json-args "$(cat packages/config/outlayer-limits.json)" network-config testnet now;
    near contract call-function as-read-only $CORE get_settlement json-args '{"position_id":"<seeded>"}' network-config testnet now → disc_bps within [0,max]; attestation URL opens
G5: near contract call-function as-read-only $ORACLE get_price json-args '{"price_identifier":"'$NVDA_PRICE_ID'"}' network-config testnet now → publish_time < 600 s old; cargo test -p nectar-core oracle_rejects
G6: pnpm --filter keeper test:oneclick (dry quote + verifyQuoteSignature) ; Feed shows R_c or "no 1Click route"
G7: cd solana && anchor test 2>&1 | tail -40; pnpm --filter keeper test:settle-devnet (uses config program id); open both explorer links
G8: pnpm --filter web test:copilot (fixture) [+ --live if NEAR_AI_API_KEY present]
G9: follow README.md top to bottom in ≤ 15 min; pnpm demo:testnet; pnpm verify; pnpm --filter docs-site build; gitleaks detect --log-opts=--all
