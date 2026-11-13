# P1 work orders (open only after p0-green) — details in the Build Prompt §7
WO-8 researcher: OutLayer publish flow + cost (F-045, F-046); Pyth NVDA id + pyth-oracle.testnet liveness (F-053); price-oracle.testnet views; 1Click tokens; SDK verifyQuoteSignature usage.
WO-9 quoter: wasm32-wasip2 program, fixed-point, clamp, ≤ 900 B stdout, tests/vectors.json (≥ 20), publish via scripts/30.
WO-10 contract: request_execution path + on_quoter_result (clamp, fallback event); oracle module with staleness/conf; update_price_feeds passthrough; test stubs.
WO-11 keeper: Hermes → update_price_feeds; 1Click dry quotes (R_c) with signature verify; Feed MCP tools; README registration section.
WO-12 web: Feed depth/attestation/oracle badge; quote form presets; console params; keepers page.
Gates: G4, G5, G6.
