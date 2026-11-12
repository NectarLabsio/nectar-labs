---
name: serverless-traces
description: Vercel functions hold only traced files; full-checkout `next start` hides missing files. Test via a standalone copy moved outside the repo.
metadata:
  type: project
---

Vercel runs each dynamic route from its `.next/server/**/*.nft.json` trace; files reached by a runtime path walk (loadConfig → config.yaml) are not traced unless listed in next.config `outputFileTracingIncludes` (WO-34p, 2026-11-12). `apps/web/scripts/check-trace.mjs` asserts this after build.

**Why:** G3b passed while the preview 500'd, because `next start` in a checkout finds config.yaml by walking up.
**How to apply:** for a runtime-bundle check, build once with a temporary `output: "standalone"`, copy `.next/standalone` to the scratchpad (outside the repo, or the walk finds the worktree's config), run `server.js` there, then revert. Turbopack also warns that config-node.ts traces "the whole project" (all of apps/web); a fix (`turbopackIgnore`) belongs in packages/sdk, which needs its own work order.
