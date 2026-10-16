import type { AgentEnforceSpec } from "./claude.js";

export const ANTIGRAVITY_MATCHER = "write_to_file|replace_file_content|multi_replace_file_content";

export const ANTIGRAVITY_ENFORCE: AgentEnforceSpec = {
  file: ".agents/hooks.json",
  format: "json",
  items(cmd) {
    return [
      {
        kind: "hook",
        agent: "antigravity",
        identity: "wikeeper-guard",
        value: { PreToolUse: [{ matcher: ANTIGRAVITY_MATCHER, hooks: [{ type: "command", command: cmd, timeout: 10 }] }] },
      },
    ];
  },
};
