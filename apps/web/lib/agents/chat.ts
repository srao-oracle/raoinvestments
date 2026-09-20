import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../supabase/admin";
import { massive } from "../market/client";
import {
  client,
  MODELS,
  logAgentRun,
  assertNotKilled,
  drainRunner,
  type DrainableRunner,
} from "./anthropic";
import { readStrategyTool, readPositionsTool, listOpportunitiesTool } from "./tools";
import { valuePortfolioTool } from "./risk-tools";
import { getBarsPlaybitTool, getQuoteTool } from "./market-tools";
import { PM_CHAT_SYSTEM } from "./prompts";
import type { ToolDeps } from "./deps";

type StoredContent = Array<{ type: string; text?: string }>;

async function getPortfolioThread(admin: SupabaseClient, portfolioId: string): Promise<string> {
  const { data } = await admin
    .from("agent_threads")
    .select("id")
    .eq("portfolio_id", portfolioId)
    .eq("scope", "portfolio")
    .is("opportunity_id", null)
    .maybeSingle();
  if ((data as { id: string } | null)?.id) return (data as { id: string }).id;
  const { data: created } = await admin
    .from("agent_threads")
    .insert({
      portfolio_id: portfolioId,
      scope: "portfolio",
      agent_role: "portfolio_manager",
      title: "Portfolio chat",
    })
    .select("id")
    .single();
  return (created as { id: string }).id;
}

export async function runPortfolioChat(
  portfolioId: string,
  userMessage: string,
): Promise<{ reply: string; threadId: string }> {
  const admin = createAdminClient();
  await assertNotKilled(admin);
  const deps: ToolDeps = { portfolioId, admin, market: massive() };
  const threadId = await getPortfolioThread(admin, portfolioId);

  const { data: hist } = await admin
    .from("agent_messages")
    .select("role, content")
    .eq("thread_id", threadId)
    .order("seq", { ascending: true })
    .limit(40);
  const history = ((hist ?? []) as Array<{ role: "user" | "assistant"; content: StoredContent }>).map(
    (m) => ({ role: m.role, content: m.content }),
  );

  await admin.from("agent_messages").insert({
    thread_id: threadId,
    role: "user",
    content: [{ type: "text", text: userMessage }],
  });

  const runner = client.beta.messages.toolRunner({
    model: MODELS.sonnet,
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
    system: PM_CHAT_SYSTEM,
    tools: [
      readStrategyTool(deps),
      readPositionsTool(deps),
      valuePortfolioTool(deps),
      listOpportunitiesTool(deps),
      getBarsPlaybitTool(deps),
      getQuoteTool(deps),
    ] as never,
    messages: [...history, { role: "user", content: userMessage }] as never,
  });

  const { final, inputTokens, outputTokens } = await drainRunner(runner as unknown as DrainableRunner);
  const reply =
    (final?.content ?? []).map((b) => (b.type === "text" ? b.text : "")).join("").trim() || "…";

  await admin.from("agent_messages").insert({
    thread_id: threadId,
    role: "assistant",
    content: [{ type: "text", text: reply }],
    model: MODELS.sonnet,
  });
  await logAgentRun(admin, {
    portfolioId,
    role: "portfolio_manager",
    model: MODELS.sonnet,
    inputTokens,
    outputTokens,
    status: "succeeded",
    threadId,
  });

  return { reply, threadId };
}
