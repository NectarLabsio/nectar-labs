# WO-12 — web — P1 surfaces (≤ 45 tool calls)
Spec: docs/process/work/interface-p1.md §Web. Read views per interface-p1 (fields may be absent until WO-10a deploys: render "P0 static pricing" /
"owner oracle" states then). Feed: oracle badge (source, age, conf), D_c/R_c with "no 1Click route" for NVDAx, settlement history with disc_bps and
an OutLayer execution link slot (https://app.outlayer.ai/executions per F-044 is unverified since docs moved, C-013 — show the link only when
the feed API provides a URL). Quote form presets 7 d / 30 d. Console owner forms: quoter pin/config, vol_bps, oracle source, pause (sign modal
preview). Keepers page from the feed API. e2e + lighthouse stay green (`PW_CHANNEL=chrome pnpm --filter web e2e`, `LH_START=1 pnpm --filter web lighthouse`).
Commit `feat(web):`.
