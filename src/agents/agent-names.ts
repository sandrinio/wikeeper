export const AGENT_NAMES = ["claude", "codex", "antigravity"] as const; // canonical order everywhere (config, prompts, output)
export type AgentName = (typeof AGENT_NAMES)[number];
export function isAgentName(value: string): value is AgentName {
  return (AGENT_NAMES as readonly string[]).includes(value);
}
