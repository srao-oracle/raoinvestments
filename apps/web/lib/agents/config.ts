import { MODELS } from "./anthropic";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export interface AgentCfg {
  model: string;
  effort: Effort;
  maxTokens: number;
}

type Role = "strategist" | "scout" | "research" | "red_team" | "portfolio_manager";

// AGENT_TIER=test downshifts to a cheap/fast tier for smoke runs; default is production.
const TEST = process.env.AGENT_TIER === "test";

export const AGENT_CONFIG: Record<Role, AgentCfg> = TEST
  ? {
      strategist: { model: MODELS.sonnet, effort: "low", maxTokens: 8000 },
      scout: { model: MODELS.sonnet, effort: "low", maxTokens: 8000 },
      research: { model: MODELS.sonnet, effort: "medium", maxTokens: 16000 },
      red_team: { model: MODELS.sonnet, effort: "medium", maxTokens: 12000 },
      portfolio_manager: { model: MODELS.sonnet, effort: "medium", maxTokens: 12000 },
    }
  : {
      strategist: { model: MODELS.sonnet, effort: "high", maxTokens: 12000 },
      scout: { model: MODELS.sonnet, effort: "low", maxTokens: 8000 },
      research: { model: MODELS.sonnet, effort: "xhigh", maxTokens: 24000 },
      red_team: { model: MODELS.opus, effort: "xhigh", maxTokens: 20000 },
      portfolio_manager: { model: MODELS.opus, effort: "high", maxTokens: 16000 },
    };
