import type { AgentName } from "./agent-names.js";

export const MODEL_TIERS = ["small", "medium"] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];
export interface ModelMapping {
  model?: string;
  warning?: string;
}
export const TIER_MODELS: Readonly<Record<AgentName, Readonly<Record<ModelTier, string | undefined>>>> = {
  claude: { small: "haiku", medium: "sonnet" },
  antigravity: { small: "flash", medium: "pro" },
  codex: { small: undefined, medium: undefined },
  // Copilot retires model ids, so these are a starting point, not a promise: both are listed in GitHub's
  // Copilot CLI model table (checked 2026-10-20), and a user can set ingest.extractor_model or
  // ingest.writer_model to any id instead of a tier. medium keeps the strength it has on the other
  // harnesses (claude: sonnet, antigravity: pro), which the writer needs to carry fact lines over
  // unchanged. Copilot CLI runs a helper whose id the account cannot reach on the session model instead.
  copilot: { small: "gpt-6-luna", medium: "claude-sonnet-5.5" },
};

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/;

export function mapModel(agent: AgentName, value: string): ModelMapping {
  const v = value.trim();
  if (v === "") return {};
  if ((MODEL_TIERS as readonly string[]).includes(v)) {
    const model = TIER_MODELS[agent][v as ModelTier];
    return model === undefined ? {} : { model };
  }
  if (!SAFE_ID.test(v)) {
    return { warning: `ingest model "${v}" has unsupported characters; using the agent default` };
  }
  if (agent === "antigravity") {
    return { model: "inherit", warning: `antigravity sub-agents accept only small/medium; "${v}" written as inherit` };
  }
  return { model: v };
}
