import type { AgentEnforceSpec } from "./claude.js";
import { toPermitCommand } from "./guard-command.js";

/** Copilot names its file tools as Claude does in the PreToolUse payload, patch body and all. */
export const COPILOT_MATCHER = "Edit|Write|NotebookEdit";

/** Copilot denies a tool call when a preToolUse hook exits non-zero, so a teammate whose wikeeper is missing
 *  or predates a subcommand would be refused every shell command and edit. Each command ends in a success
 *  exit instead: wikeeper's own decisions are JSON on stdout with exit 0, so they still apply. `command`
 *  runs in a POSIX shell; `windows` overrides it with the PowerShell form. */
function hookEntry(matcher: string, cmd: string): unknown {
  return { matcher, hooks: [{ type: "command", command: `${cmd} || true`, windows: `${cmd}; exit 0`, timeout: 10 }] };
}

export const COPILOT_ENFORCE: AgentEnforceSpec = {
  file: ".github/hooks/wikeeper.json",
  format: "json",
  items(cmd, permission) {
    return [
      // Copilot CLI refuses a hook file without a schema version; VS Code ignores the key.
      { kind: "hook", agent: "copilot", identity: "version", value: 1 },
      {
        kind: "hook",
        agent: "copilot",
        identity: "hooks.PreToolUse[guard:copilot]",
        value: hookEntry(COPILOT_MATCHER, cmd),
      },
      // Copilot has no committed permission-rule file, so the rules Claude keeps in settings.json are
      // applied here instead: one hook that decides the wikeeper commands and stays silent on the rest.
      {
        kind: "rule",
        agent: "copilot",
        identity: "hooks.PreToolUse[permit:copilot]",
        value: hookEntry("Bash", `${toPermitCommand(cmd)} --permission ${permission}`),
      },
    ];
  },
};
