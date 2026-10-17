// test/agents/rule-match.ts — Contract C5 (owner STORY-002-09). Test helper; consumers STORY-003-10, STORY-005-09.
//
// A small model of the documented rule matching, checked against:
//   - Claude Code permissions: https://code.claude.com/docs/en/permissions (fetched 2026-10-17).
//     Evaluation order deny -> ask -> allow, first match decides; `*` matches any text; a trailing
//     " *" also matches the bare command.
//   - Codex rules: https://developers.openai.com/codex/rules (fetched 2026-10-17).
//     `prefix_rule` matches a leading run of argv tokens; the strictest decision wins
//     (forbidden > prompt > allow).
// Not modelled: compound commands, wrappers such as `sh -c`.

export type ClaudeDecision = "deny" | "ask" | "allow" | "default";
export interface ClaudePermissions { allow?: readonly string[]; ask?: readonly string[]; deny?: readonly string[] }

function patternMatches(rule: string, command: string): boolean {
  const m = /^Bash\((.*)\)$/s.exec(rule);
  if (m === null) return false;
  const p = m[1]!;
  const esc = (s: string): string => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`^${p.split("*").map(esc).join(".*")}$`, "s").test(command)) return true;
  if (p.endsWith(" *") && p.indexOf("*") === p.length - 1) return command === p.slice(0, -2);
  return false;
}

export function claudeDecision(perms: ClaudePermissions, command: string): ClaudeDecision {
  for (const list of ["deny", "ask", "allow"] as const) {
    if ((perms[list] ?? []).some((r) => patternMatches(r, command))) return list;
  }
  return "default";
}

export type CodexDecision = "forbidden" | "prompt" | "allow" | "default";
const STRENGTH: Record<Exclude<CodexDecision, "default">, number> = { allow: 1, prompt: 2, forbidden: 3 };

export function codexDecision(lines: readonly string[], argv: readonly string[]): CodexDecision {
  let best: CodexDecision = "default";
  for (const line of lines) {
    const m = /^prefix_rule\(pattern=\[(.*?)\], decision="(allow|prompt|forbidden)"\)$/.exec(line);
    if (m === null) continue;
    const tokens = [...m[1]!.matchAll(/"([^"]*)"/g)].map((t) => t[1]!);
    if (tokens.length > argv.length || !tokens.every((t, i) => argv[i] === t)) continue;
    const d = m[2] as Exclude<CodexDecision, "default">;
    if (best === "default" || STRENGTH[d] > STRENGTH[best]) best = d;
  }
  return best;
}
