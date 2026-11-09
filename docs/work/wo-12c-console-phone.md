# WO-12c — web — /console phone overlap (small: ≤ 15 tool calls)
`PW_CHANNEL=chrome pnpm --filter web exec playwright test -g console` fails on phone on main (dd21fd3): the sticky nav ("Connect
wallet") covers the "Payload: set_oracle_source" <summary>, so the click never lands (WO-12b report). Fix the layout, not the test:
e.g. `scroll-margin-top` ≥ nav height on focus/scroll targets (or `scroll-padding-top` on html) and no stacking overlap. Real users
on phones hit the same thing. e2e (all specs) + lighthouse green. Commit `fix(web):`.
