# WO-96 — independent review of the Weekend Shield video + EVIDENCE (verifier; WO-35 "Review before sending"). Base: main f790b8c.

You have not seen the edit. Inputs (read-only, outside the repo): /Volumes/T7/nectar-demo-media/demo/weekend/
nectar-demo.mp4 (1080p master, 88.2 s, no captions), nectar-demo-captions.mp4, shotlist.md, nectar-demo.srt; raw takes in
/Volumes/T7/nectar-demo-media/raw/take-a/txs.json and take-b/txs.json. ffmpeg: ~/.nectar/tools/node_modules/ffmpeg-static/ffmpeg.

1. Frames: extract one frame per second of the master (scale to ≤ 960 px wide; tile several per image to save tokens) and check each for: console
   overlays, error toasts, stale-price badges, empty states, personal data, localhost or wrong URLs, the amber copilot "Key missing" notice, hackathon
   branding. On-screen numbers must match the transactions in shotlist.md (loan #22, $100 debt, 15 bps / $0.15 Weekend Shield, $99.55 net, agent
   402 → 200). Also check the captioned version's captions against shotlist.md. List every finding with its timestamp.
2. EVIDENCE: verify each tx in take-a/txs.json and take-b/txs.json on testnet (status + the events named). FastNear RPC is rate-limited from this
   machine tonight (429s): space calls ≥ 2 s apart, or use https://api-testnet.nearblocks.io/v1/txns/<hash>. Then add one EVIDENCE section
   "WO-35 after-close takes (2026-11-13 21:00–21:16Z)": session closed (outside_hours), take A txs with links, take B s3 + its three failed s5
   attempts (borrow landed, payment failed: 429 / storage check / settlement_failed; relayer submitted nothing), frame-review result.
   No home paths in EVIDENCE. Save your frame review notes as evidence/WO-35/weekend-frame-review-<UTC>.md.
Do not change anything else. No builds or tests needed. Commit `docs(evidence): WO-35 after-close takes + frame review (WO-96)`.
NO Co-Authored-By. Report ≤ 12 lines: findings by timestamp (or none), txs verified, EVIDENCE section heading.
