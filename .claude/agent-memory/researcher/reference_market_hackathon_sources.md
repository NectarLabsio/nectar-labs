---
name: reference-market-hackathon-sources
description: Where daily-verify pulls hackathon rules and README market figures; which sources block automated fetches
metadata:
  type: reference
---
- Hackathon rules: `curl https://nearhackathon.com/HACKATHON.md` and `diff` against docs/HACKATHON.md (one command covers deadline, fields, tracks). Homepage HTML has the literal "14 Nov 2026 · 23:59 UTC".
- DefiLlama JSON API works without key: api.llama.fi/protocol/near-intents, /protocol/rhea-finance (parent), /summary/dexs/near-intents?dataType=dailyVolume, /summary/fees/near-intents?dataType=dailyFees|dailyRevenue (sum totalDataChart for quarters), /protocols.
- Blocked as of 2026-11-10: defillama.com/rwa (403, curl + WebFetch); api.llama.fi/rwa/stats is per-asset only (no headline AUM). solana.com case study 429. Do NOT spoof user agents (auto-mode classifier denies it as bot-check circumvention).
- nearbuilders.org/build: SPA but server HTML has the text; strip tags with python.
Related: [[reference-nearai-cloud]], [[reference-outlayer-oracles]]
