# nectar-labs support bundle — how to use (5 minutes)

1. `mkdir nectar-labs && cd nectar-labs && unzip ../nectar-labs-support.zip && mv nectar-labs/* nectar-labs/.[!.]* . && rmdir nectar-labs`
   (or unzip and `cd` into the folder it creates).
2. Check what is inside: `CLAUDE.md`, `.claude/` (settings, agents, hooks), `docs/` (PRD.md, BUILD_PROMPT.md, FACTS.md seeded,
   HUMAN_HANDOFF.md, DECISIONS.md, EVIDENCE.md, RUNBOOK.md, DESIGN_SYSTEM.md, DEMO_SCRIPT.md, SUBMISSION.md, X_POST.md, STATE.md,
   work/*.md, img/*.svg, HACKATHON.md, FACTS-nectar-labs.md), `landing/index.html`, `packages/ui/tokens.css`, `packages/ui/logo/source.png`,
   `packages/config/config.yaml`, `apps/docs-site/` skeleton, `scripts/*.sh`, `.github/workflows/ci.yml`, `.env.example`, `README.template.md`.
3. `chmod +x .claude/hooks/*.sh scripts/*.sh && git init && git add -A && git commit -m "chore: seed"`.
4. Open Claude Code here with the model and effort you want for the whole session (do not change them mid-session).
5. Paste the kickoff prompt from `docs/BUILD_PROMPT.md` §15 as the first message. Then leave it alone; check `docs/STATE.md`
   and `docs/HUMAN_HANDOFF.md` when you come back.

Nothing in this bundle contains a key, a token or a secret. `HUMAN_CONFIRMED=1` is yours alone.
