---
name: web-e2e-patterns
description: How apps/web E2E tests v2-only UI while config points at v1 and all features flags are false
metadata:
  type: project
---

v2 (nectar-core-v2) is not deployed as of 2026-11-10; config.yaml `accounts.core` is v1 and every `features.*` is false.
E2E for v2 UI routes `**/*fastnear.com/**` and answers core view calls from `apps/web/e2e/fixtures/v2-views.json`;
writes use the localhost-only `window.__NECTAR_E2E_MOCK__.near` wallet that records intents in `__NECTAR_E2E_CALLS__`.

**Why:** gates (G2b, G14) are pending, but the UI must be tested and must not claim "live".
**How to apply:** add any new view to the fixture; regenerate `/agents` example with `node apps/web/scripts/build-agent-example.ts` if the fixture changes. Never use the word "live" in /agents copy (E2E asserts it).
