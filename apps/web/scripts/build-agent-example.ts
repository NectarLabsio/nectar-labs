// Builds the /agents "example" fixture (WO-26a): the real Feed MCP tool code (services/feed/src/skill.ts,
// `openProtectedStockLoan`) run against the mocked nectar-core v2 view answers in e2e/fixtures/v2-views.json.
// Nothing here touches the network or a key. Run: node scripts/build-agent-example.ts
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { openProtectedStockLoan } from "../../../services/feed/src/skill.ts";

const views = JSON.parse(readFileSync(resolve(import.meta.dirname, "../e2e/fixtures/v2-views.json"), "utf8")) as Record<string, unknown>;
const reader = {
  async view(method: string) {
    if (!(method in views)) throw new Error(`fixture has no ${method}`);
    return { value: views[method], blockHeight: 1 };
  },
};

// Same input the x402 demo agent sends (services/x402/src/demo-agent.ts defaults).
const input = { account_id: "agent1.nectar.testnet", collateral: "NVDAx", units: "1000000", borrow_usd: "10" };
const output = await openProtectedStockLoan({ views: reader, coreId: "nectar-core-v2.nectar.testnet" }, input);
const out = resolve(import.meta.dirname, "../lib/agents");
mkdirSync(out, { recursive: true });
writeFileSync(
  resolve(out, "open-loan-example.json"),
  JSON.stringify({ _comment: "EXAMPLE, not a live call: services/feed/src/skill.ts run against e2e/fixtures/v2-views.json by scripts/build-agent-example.ts.", input, output }, null, 2) + "\n",
);
process.stdout.write("wrote lib/agents/open-loan-example.json\n");
