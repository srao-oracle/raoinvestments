// Live Tool Runner smoke. Validates @anthropic-ai/sdk betaZodTool + toolRunner with zod v4.
//   ANTHROPIC_API_KEY=... MASSIVE_API_KEY=... pnpm --filter web exec tsx scripts/smoke-agent.ts
import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { massive } from "../lib/market/client";
import { getPreviousClose } from "../lib/market/rest/bars";

const client = new Anthropic();

const getPrevClose = betaZodTool({
  name: "get_prev_close",
  description: "Get the previous daily close price for a US stock ticker.",
  inputSchema: z.object({ ticker: z.string().describe("e.g. AAPL") }),
  run: async ({ ticker }) => {
    const bar = await getPreviousClose(massive(), ticker.toUpperCase());
    return JSON.stringify({ ticker: ticker.toUpperCase(), prev_close: bar?.c ?? null });
  },
});

async function main() {
  const final = await client.beta.messages.toolRunner({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    tools: [getPrevClose],
    messages: [
      {
        role: "user",
        content: "Use the tool to fetch AAPL's previous close, then reply with one short sentence stating it.",
      },
    ],
  });

  const text = final.content.map((b) => (b.type === "text" ? b.text : "")).join(" ").trim();
  console.log("AGENT:", text);
  console.log("stop_reason:", final.stop_reason);
  console.log("SMOKE OK");
}

main().catch((e) => {
  console.error("SMOKE FAILED:", e);
  process.exit(1);
});
