// WO-17: copilot verifier on the recorded fixture. `--live` additionally runs the live round trip (needs NEAR_AI_API_KEY, TODO-H7).
import { spawnSync } from "node:child_process";

const live = process.argv.includes("--live");
if (live && !process.env.NEAR_AI_API_KEY) {
  console.error("--live needs NEAR_AI_API_KEY (TODO-H7). Fixture run: pnpm --filter web test:copilot");
  process.exit(1);
}
const r = spawnSync(process.execPath, ["--test", "--test-reporter=spec", "--import", "./scripts/node-test-shims.mjs", "lib/copilot/verify.test.ts"],{ stdio: "inherit", env: { ...process.env, COPILOT_LIVE: live ? "1" : "0" } });
process.exit(r.status ?? 1);
