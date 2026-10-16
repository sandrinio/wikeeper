# Hook protocols research: Claude Code, Codex, Antigravity

Checked 2026-10-16 against official docs, plus the official `openai/codex` GitHub source where the docs point to it. It supports STORY-002-03, STORY-002-05 and STORY-002-06. Anything the official sources don't state is marked **UNVERIFIED**.

URL notes:
- `developers.openai.com/codex/*` now redirects to `learn.chatgpt.com/docs/*`, so the Codex URLs below use the new host.
- Each docs page has a Markdown twin. Add `.md` for `code.claude.com/docs/en/<page>.md`, `learn.chatgpt.com/docs/<page>.md` and `antigravity.google/docs/<page>.md`.

---

## Corrections to stories

Each item says what the story assumed and what the docs say.

1. **Claude MultiEdit and NotebookEdit (002-05 R2, 002-06 R2).**
   - `MultiEdit` is not in the current tool list. The permissions page calls it "the legacy `MultiEdit` tool".
   - `NotebookEdit` is a current file-writing tool, and its path is in `tool_input.notebook_path`, not `file_path`.
   - The matcher `Edit|Write|MultiEdit` is treated as a list of exact names, so it does **not** match `NotebookEdit`.
   - Fix: use matcher `Edit|Write|MultiEdit|NotebookEdit`, and have the adapter read `file_path` or `notebook_path`.
2. **Claude payload is larger than assumed (002-05 R7 fixture).**
   - The payload also carries `prompt_id`, `permission_mode`, `effort`, `tool_use_id`, an optional `scratchpad_dir`, and an optional `agent_id`/`agent_type`.
   - `tool_input.file_path` is always absolute for Write, Edit and Read.
   - On Windows the path uses backslashes, so normalise separators before the containment check.
3. **Codex patch field (002-05 R2).** The patch text is the string in **`tool_input.command`**. `tool_name` is always `"apply_patch"`, even when the matcher used `Edit` or `Write`.
   - The patch grammar also has `*** Begin Patch`, `*** End Patch`, `*** Environment ID: …` and `*** End of File` lines. The parser accepts whitespace around markers, so the regex should allow `^\s*` and trim the captured path.
   - Paths in the patch may be relative or absolute.
4. **A Codex patch sent through the shell bypasses the `apply_patch` matcher (002-05/06).** This is from the source code, not the docs.
   - If the model sends `apply_patch <<'EOF' …` through the shell tool (`exec_command`), the PreToolUse hook fires as `tool_name: "Bash"`, and the whole command is in `tool_input.command`.
   - The docs warn: "Treat tool hooks as a useful guardrail, not a complete enforcement boundary."
   - Options: also match `Bash` and scan for `*** Begin Patch`, or accept the gap and rely on lint (EPIC-005).
5. **Codex trust is tied to the exact hook definition (002-06 R5/R8).**
   - Codex records trust against a hash of the exact hook definition, and a new or changed hook is skipped until re-trusted in `/hooks`.
   - Every wikeeper upgrade that rewrites `npx -y wikeeper@<version>` will therefore **silently disable** the guard until the user re-trusts it.
   - The `codex-trust` doctor note must mention that re-review is needed after `update`. Consider an unpinned command string so the hash stays stable.
6. **Codex rules miss common command forms (002-06 R3).**
   - `prefix_rule(pattern=["npx","wikeeper"])` matches argv by exact prefix. It does not match the bare `wikeeper …` that R5 prefers, and it does not match `npx -y wikeeper@x …`.
   - Fix: add rules for `["wikeeper"]` and `["wikeeper","ingest","start"]`. The Claude `Bash(npx wikeeper *)` rule has the same gap for `npx -y …`.
   - The rules feature is labelled "experimental", and rules decide whether a command runs **outside the sandbox**.
7. **Antigravity payload is entirely different (002-05 R2, R7).**
   - The PreToolUse stdin has `toolCall.name` and `toolCall.args`. The target path is **`toolCall.args.TargetFile`** (PascalCase).
   - The payload has **no** `cwd`, **no** `tool_name` or `tool_input`, and **no** `hook_event_name`.
   - It has `workspacePaths[]` (absolute), `conversationId`, `stepIdx`, `transcriptPath`, `artifactDirectoryPath` and `modelName`, all camelCase.
   - **UNVERIFIED:** whether `TargetFile` is always absolute.
8. **Antigravity has a third write tool (002-05 R2, 002-06 R4).** `multi_replace_file_content` also writes files, using `TargetFile`. Fix: use matcher `write_to_file|replace_file_content|multi_replace_file_content`.
9. **Antigravity `hooks.json` shape (002-06 R4).**
   - The top-level keys are **hook names**, each mapping to events, for example `{"wikeeper-guard": {"PreToolUse": [ … ]}}`.
   - It is not `{"hooks": {"PreToolUse": …}}`.
   - Each hook may also set `enabled: false`. The default `timeout` is 30 s.
   - Use the name key as the entry identity for merge and remove (R6/R7).
10. **Antigravity allow output (002-05 R4).**
    - `decision` is documented as **Required** in PreToolUse output. Allow should print `{"decision":"allow"}` instead of nothing.
    - **UNVERIFIED:** what empty stdout or a non-zero exit means. The docs are silent on exit codes. CLI v1.0.16 fixed an error on an *empty decision string*, which suggests empty output is tolerated, but that is not documented.
11. **Antigravity project permissions (002-06 R4, R8).**
    - Project-scope permission rules **do** exist: the `/permissions` "Project" scope in the CLI, and "Project-level permissions" in the app.
    - They are stored **outside the repo**. CLI changelog v1.0.12 places them in `~/.gemini/config/projects/`.
    - So "no project-level rules file in the repo" is correct, but "no project-level permission rules" is not.
    - Global CLI rules use `~/.gemini/antigravity-cli/settings.json` with `permissions.{allow,ask,deny}`, for example `command(npx wikeeper ingest start)`.
12. **Antigravity workspace hooks need folder trust (002-06 R8).** Per CLI changelog v1.1.1, workspace hooks in `.agents/hooks.json` load only after the folder is trusted. Add a doctor note similar to `codex-trust`.
13. **A `node_modules/.bin` binary needs a full path (002-06 R5).** This is an inference from the docs.
    - Hook commands run as shell commands, and the docs don't say that `node_modules/.bin` is on `PATH`. A bare `wikeeper` that exists only there would fail to start.
    - In Claude that is a "non-blocking error", so the tool call proceeds and the guard fails open.
    - Fix: write a full path, such as `"$CLAUDE_PROJECT_DIR"/node_modules/.bin/wikeeper`, or `$(git rev-parse --show-toplevel)/node_modules/.bin/wikeeper` for Codex. The docs example uses this git-root form.
14. **Claude workspace trust (002-06 manual verification).** In an interactive session, Claude Code holds back hooks from settings files until the workspace-trust dialog is accepted.
15. **Antigravity sub-agents default to `mainAgent: true` (002-03).** Without `mainAgent: false`, `wiki-extractor` and `wiki-writer` also appear as selectable primary agents.
16. **Antigravity workflows have not ended yet.** As of 2026-10-16 they still work. The docs say they "will stop working on **October 19, 2026**". No wikeeper story depends on them.

Everything else in the stories was confirmed. The details follow.

---

## A. PreToolUse STDIN payloads

### A1. Claude Code

These facts are confirmed.

- **Common fields:** `session_id`, `prompt_id` (absent before the first prompt), `transcript_path`, `cwd`, `scratchpad_dir` (optional, v2.1.257+), `permission_mode`, `effort.level` (when supported), `hook_event_name`, and `agent_id`/`agent_type` (in subagents or with `--agent`). Source: https://code.claude.com/docs/en/hooks#common-input-fields
- **PreToolUse fields:** `tool_name`, `tool_input`, `tool_use_id`, and `mcp_server` for MCP tools only. Source: https://code.claude.com/docs/en/hooks#pretooluse-input
- **TypeScript types:** `BaseHookInput` and `PreToolUseHookInput`. Source: https://code.claude.com/docs/en/agent-sdk/typescript
- **Absolute paths:** "For the file tools `Write`, `Edit`, and `Read`, `tool_input.file_path` is always absolute". Windows paths use backslash separators. Source: https://code.claude.com/docs/en/hooks#pretooluse-input
- **Tool input shapes.** Source: https://code.claude.com/docs/en/agent-sdk/typescript and https://code.claude.com/docs/en/hooks#pretooluse-input
  - `Write`: `{ file_path, content }`
  - `Edit`: `{ file_path, old_string, new_string, replace_all? }`
  - `NotebookEdit`: `{ notebook_path, cell_id?, new_source, cell_type?, edit_mode? }`
- **Current file-modifying tools** are `Edit`, `Write` and `NotebookEdit`. `MultiEdit` is not in the tool table. Source: https://code.claude.com/docs/en/tools-reference
- **MultiEdit is legacy.** The permissions page says "…or the legacy `MultiEdit` tool…". Source: https://code.claude.com/docs/en/permissions
- **Edit rules cover all three tools.** `Edit(...)` permission rules cover Edit, Write and NotebookEdit. Source: https://code.claude.com/docs/en/tools-reference
- **Other ways to write files:** `Bash`, `PowerShell` and `Monitor` can also write files, and no story guards them. `FileChanged` hooks fire after a change but cannot block it. Source: https://code.claude.com/docs/en/hooks#pretooluse

**Fixture JSON for `claude-write.json`.** The IDs, paths and effort level are illustrative values. The field names and shape follow the docs.
```json
{
  "session_id": "3f1c2a9e-7b4d-4e2a-9c1f-5d8e6a7b0c21",
  "prompt_id": "550e8400-e29b-41d4-a716-446655440000",
  "transcript_path": "/Users/dev/.claude/projects/-Users-dev-acme/3f1c2a9e-7b4d-4e2a-9c1f-5d8e6a7b0c21.jsonl",
  "cwd": "/Users/dev/acme",
  "permission_mode": "default",
  "effort": { "level": "high" },
  "hook_event_name": "PreToolUse",
  "tool_name": "Write",
  "tool_input": {
    "file_path": "/Users/dev/acme/.wiki/pages/team.md",
    "content": "# Team\n\nUpdated by hand.\n"
  },
  "tool_use_id": "toolu_01ABC123DEF456GHI789JKL0"
}
```
Possible additional fixtures:
- An Edit call: `"tool_name": "Edit"` with `"tool_input": {"file_path": "/Users/dev/acme/.wiki/pages/team.md", "old_string": "a", "new_string": "b", "replace_all": false}`.
- A notebook call: `"tool_name": "NotebookEdit"` with `"tool_input": {"notebook_path": "…", "new_source": "…", "edit_mode": "replace"}`.

### A2. Codex

These facts are confirmed.

- **PreToolUse fires for `apply_patch`.** Source: https://learn.chatgpt.com/docs/hooks#tool-coverage. The docs say:
  > `apply_patch` | Yes | Yes | Match as `apply_patch`, `Edit`, or `Write`.
- **Matcher aliases.** This is what the story's phrase "matched as Edit/Write" refers to. Source: https://learn.chatgpt.com/docs/hooks#pretooluse. The docs say:
  > For file edits through `apply_patch`, `matcher` values can use `apply_patch`, `Edit`, or `Write`; hook input still reports `tool_name: "apply_patch"`.
- **Patch field.** Source: https://learn.chatgpt.com/docs/hooks#pretooluse. The docs say:
  > `Bash` and `apply_patch` use `tool_input.command`.

  The handler builds `json!({ "command": command })` from the raw patch text, and only does so for the freeform (`Custom`) tool payload. Source: https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/handlers/apply_patch.rs
- **Input schema.** Source: https://github.com/openai/codex/blob/main/codex-rs/hooks/schema/generated/pre-tool-use.command.input.schema.json. The docs link to this generated schema and note that `main` may be ahead of the current release.
  - `additionalProperties: false`.
  - Required fields: `cwd`, `hook_event_name`, `model`, `permission_mode`, `session_id`, `tool_input`, `tool_name`, `tool_use_id`, `transcript_path` (string or null), `turn_id`.
  - Optional fields: `agent_id`, `agent_type`.
- **Common fields table:** `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `model`. PreToolUse also includes `permission_mode`, `turn_id`, `tool_name`, `tool_use_id` and `tool_input`. So yes, the payload has **`cwd`**. Source: https://learn.chatgpt.com/docs/hooks#common-input-fields
- **Patch grammar.** Source: https://github.com/openai/codex/blob/main/codex-rs/apply-patch/src/parser.rs
  ```
  start: begin_patch environment_id? hunk+ end_patch
  begin_patch: "*** Begin Patch" LF
  environment_id: "*** Environment ID: " filename LF
  add_hunk: "*** Add File: " filename LF add_line+
  delete_hunk: "*** Delete File: " filename LF
  update_hunk: "*** Update File: " filename LF change_move? change?
  change_move: "*** Move to: " filename LF
  eof_line: "*** End of File" LF
  ```
  - The parser accepts "leading/trailing whitespace around patch markers".
  - A test accepts both relative and absolute hunk paths.
  - Lenient mode also accepts the patch wrapped in `<<'EOF' … EOF`.
- **Shell path.** This is from the source code. When `apply_patch` arrives through `exec_command`, the hook payload is `tool_name: "Bash"` with `tool_input.command` set to the raw command (`HookToolName::bash()`). The intercepted patch does not fire a separate `apply_patch` hook. Source: https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/handlers/unified_exec/exec_command.rs and https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/handlers/apply_patch.rs
- **Coverage warning.** The docs say: "Some specialized tool paths can opt out of the default hook path. Treat tool hooks as a useful guardrail, not a complete enforcement boundary." Source: https://learn.chatgpt.com/docs/hooks#tool-coverage

**Fixture JSON for `codex-apply-patch.json`.** The IDs and the model slug are illustrative; `gpt-6-luna` is the slug used in the Codex docs examples. The `transcript_path` format is **UNVERIFIED**, and the schema also allows `null`. The field set matches the generated schema exactly.
```json
{
  "session_id": "019a3c2e-4b7d-7e21-9c1f-5d8e6a7b0c21",
  "turn_id": "019a3c2e-5c11-7a02-8d3e-0f1a2b3c4d5e",
  "transcript_path": null,
  "cwd": "/Users/dev/acme",
  "hook_event_name": "PreToolUse",
  "model": "gpt-6-luna",
  "permission_mode": "default",
  "tool_name": "apply_patch",
  "tool_use_id": "call_8Hk2mQ4xV9pL1sT6",
  "tool_input": {
    "command": "*** Begin Patch\n*** Update File: src/a.ts\n@@\n-export const a = 1;\n+export const a = 2;\n*** Update File: .wiki/pages/risks.md\n@@\n-Old risk\n+New risk\n*** End Patch\n"
  }
}
```

### A3. Antigravity (App, CLI and IDE share one hooks format)

These facts are confirmed. Source for all of them: https://antigravity.google/docs/hooks

- **Input fields.** The docs say "Field names use camelCase."
  - Common fields: `conversationId`, `workspacePaths` (array of absolute directory paths), `transcriptPath`, `artifactDirectoryPath`, `modelName`.
  - PreToolUse adds `toolCall.name`, `toolCall.args` and `stepIdx`.
- **No `cwd`, `hook_event_name`, `tool_name` or `tool_input` fields exist.**
- **File-writing tools and their arguments.**
  - `write_to_file`: `TargetFile`, `Overwrite`, `CodeContent`, `Description`, `IsArtifact?`, `ArtifactMetadata?`
  - `replace_file_content`: `TargetFile`, `Instruction`, `Description`, `AllowMultiple`, `TargetContent`, `ReplacementContent`, `StartLine`, `EndLine`, `TargetLintErrorIds?`
  - **`multi_replace_file_content`**: `TargetFile`, `Instruction`, `Description`, `ReplacementChunks`, `TargetLintErrorIds?`, `ArtifactMetadata?`
- **`run_command` can also write files.** Its arguments are `CommandLine`, `Cwd`, … and it is not guarded by any story.
- **UNVERIFIED** (the docs list argument names only):
  - Whether `TargetFile` is always absolute. Resolve a relative path against each entry of `workspacePaths`, falling back to `process.cwd()`.
  - The argument value types, for example whether `Overwrite` is a boolean.
  - The hook process's working directory.

**Fixture JSON for `antigravity-write.json`.** The IDs, paths and model name are illustrative; `gemini-3.6-flash-medium` is the name used in the docs examples. The shape follows the docs PreToolUse example.
```json
{
  "toolCall": {
    "name": "write_to_file",
    "args": {
      "TargetFile": "/Users/dev/acme/.wiki/pages/team.md",
      "Overwrite": true,
      "CodeContent": "# Team\n\nUpdated by hand.\n",
      "Description": "Update team page"
    }
  },
  "stepIdx": 7,
  "conversationId": "ec33ebf9-0cba-4100-8142-c61503f6c587",
  "workspacePaths": ["/Users/dev/acme"],
  "transcriptPath": "/Users/dev/.gemini/antigravity-cli/brain/ec33ebf9-0cba-4100-8142-c61503f6c587/.system_generated/logs/transcript.jsonl",
  "artifactDirectoryPath": "/Users/dev/.gemini/antigravity-cli/brain/ec33ebf9-0cba-4100-8142-c61503f6c587",
  "modelName": "gemini-3.6-flash-medium"
}
```

---

## B. Deny responses

### B1. Claude: confirmed
- **JSON deny.** Print `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"…"}}` on stdout and exit 0. Source: https://code.claude.com/docs/en/hooks#pretooluse-decision-control
  - `permissionDecision` accepts `allow`, `deny`, `ask` or `defer`. When hooks disagree, precedence is `deny > defer > ask > allow`.
  - The old top-level `decision`/`reason` form is deprecated for PreToolUse.
- **Exit 2 alternative.** "A hook that blocks by exiting 2 routes the same way as `"deny"`: Claude sees the stderr message as the denial reason." Source: https://code.claude.com/docs/en/hooks#pretooluse-decision-control
- **Exit-code table.** Source: https://code.claude.com/docs/en/hooks#exit-code-output
  - Exit 0 with nothing on stdout: success, and the normal permission flow applies.
  - Any other exit code, or a hook that fails to start: a non-blocking error, and the tool call **proceeds**.
  - `onFailure: "block"` (v2.1.295+) turns hook failures into blocks.
- **Fail-open warning (R6).** Exit 0 with a warning on stderr is valid. A plain-text stdout on exit 0 is not shown in the transcript for PreToolUse. Source: https://code.claude.com/docs/en/hooks#exit-code-0

### B2. Codex: confirmed, and a JSON form also exists
- **Exit 2 form.** The docs say: "You can also use exit code `2` and write the blocking reason to `stderr`." Source: https://learn.chatgpt.com/docs/hooks#pretooluse
- **Documented JSON forms.**
  - `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"…"}}`, which is the same as Claude's.
  - The legacy `{"decision":"block","reason":"…"}`.
  - Source: https://learn.chatgpt.com/docs/hooks#pretooluse
- **Simplification for STORY-002-05.** Claude and Codex could share one JSON deny response.
- **Unsupported values.**
  - `permissionDecision: "ask"`, `continue`, `stopReason` and `suppressOutput` are parsed but unsupported. Codex marks the hook run as failed and **continues the tool call**.
  - "Plain text on `stdout` is ignored."
  - Source: https://learn.chatgpt.com/docs/hooks#pretooluse
- **Exit 0 with no output is success.** Source: https://learn.chatgpt.com/docs/hooks#common-output-fields

### B3. Antigravity: the shape is confirmed, the exit code is not
- **Deny output.** Print `{"decision":"deny","reason":"…"}` on stdout. The docs mark `decision` as **Required**. Source: https://antigravity.google/docs/hooks#pretooluse
  - Decision values: `allow`, `auto_approve`, `deny`, `ask`, `force_ask`, `deny_unless_prior_grant`.
  - Optional fields: `reason`, `overwrite`, `permissionOverrides`.
- **UNVERIFIED:** exit-code semantics, and the behaviour on empty stdout. Recommendation: always print `{"decision":"allow"}` for allow, and `{"decision":"deny","reason":…}` with exit 0 for deny.
- **Changelog evidence on failures.** Source: https://antigravity.google/docs/changelog
  - App v2.12.0: "A failing custom hook no longer ends the session; it is now reported as an error and the conversation continues."
  - CLI v1.0.16: "safely handling empty decision strings returned by pre-tool hooks".

---

## C. Hook registration files

### C1. Claude `.claude/settings.json`: confirmed
Sources: https://code.claude.com/docs/en/hooks#hook-locations and https://code.claude.com/docs/en/hooks (matcher table)

**Matcher rules:**
- A matcher of `"*"`, `""` or omitted matches everything.
- A matcher made only of letters, digits, `_`, `-`, spaces, `,` and `|` is a list of exact names.
- Any other character makes it an unanchored JavaScript regex.

**Handler fields:** `type`, `command`, `args` (exec form, no shell), `timeout` (default 600 s for `command`), `if`, `onFailure`.

**Trust:** in an interactive session, hooks wait for the workspace-trust dialog. In a `-p` or SDK session, the folder is treated as trusted. Source: https://code.claude.com/docs/en/hooks#workspace-trust

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit|NotebookEdit",
        "hooks": [
          { "type": "command", "command": "wikeeper hook guard --agent claude" }
        ]
      }
    ]
  }
}
```

### C2. Codex: both forms work; use `.codex/hooks.json`
Source for this section: https://learn.chatgpt.com/docs/hooks#where-codex-looks-for-hooks

**Locations:**
- Codex discovers hooks as `hooks.json` **or** as inline `[hooks]` tables in `config.toml`, next to each active config layer.
- The documented repo locations are `<repo>/.codex/hooks.json` and `<repo>/.codex/config.toml`.
- If one layer has both, Codex merges them and warns at startup. The docs say: "Prefer one representation per layer."

**Trust and review** (https://learn.chatgpt.com/docs/hooks#review-and-trust-hooks):
- "Project-local hooks load only when the project `.codex/` layer is trusted."
- "Codex records trust against the hook's current hash, so new or changed hooks are marked for review and skipped until trusted. Use `/hooks` in the CLI to … trust hooks."
- `--dangerously-bypass-hook-trust` skips the check for one invocation.

**Defaults** (https://learn.chatgpt.com/docs/hooks#turn-hooks-off):
- Hooks are enabled by default. `[features] hooks = false` turns them off; `codex_hooks` is a deprecated alias.

**Schema** (https://learn.chatgpt.com/docs/hooks#config-shape):
- The schema is the same as Claude's: event, then a list of `{matcher, hooks:[{type,command,timeout,statusMessage,async}]}`.
- `timeout` is in seconds, default 600.
- There is an optional top-level `description`.
- Commands run with the session `cwd`. For repo-local hooks, the docs recommend resolving the command path from the git root.

**Matcher** (https://learn.chatgpt.com/docs/hooks#matcher-patterns): a regex. `"*"`, `""` or omitted matches all.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^(apply_patch|Edit|Write)$",
        "hooks": [
          { "type": "command", "command": "wikeeper hook guard --agent codex", "timeout": 30 }
        ]
      }
    ]
  }
}
```
The same hook as inline TOML in `config.toml`:
```toml
[[hooks.PreToolUse]]
matcher = "^apply_patch$"
[[hooks.PreToolUse.hooks]]
type = "command"
command = "wikeeper hook guard --agent codex"
```

### C3. Antigravity `.agents/hooks.json`: confirmed location, but the story's schema is wrong
Source for this section: https://antigravity.google/docs/hooks

**Locations:**
- Workspace: `.agents/hooks.json`.
- Global: `~/.gemini/config/hooks.json`. The CLI also reads `~/.gemini/antigravity-cli/settings.json`.
- Plugins can bundle hooks.
- The App, CLI and IDE all use the same file.

**Schema:**
- The top level maps a **hook name** to its event configurations.
- Each hook may set `enabled` (default `true`).
- Handler fields: `type` (only `"command"` is supported, and it is the default), `command` (required), `timeout` (seconds, default **30**).

**Matcher:** a regex on the tool name. `""` or `"*"` matches all; `"run_command|view_file"` matches either tool.

**Trust:** workspace hooks load only after the folder is trusted. CLI v1.1.1 fixed "workspace-local hooks defined in `/.agents/hooks.json` not loading after trusting a folder". Source: https://antigravity.google/docs/changelog

**Inspection:** `/hooks` in the CLI. In the App or IDE: Settings > Customizations > Hooks.

```json
{
  "wikeeper-guard": {
    "PreToolUse": [
      {
        "matcher": "write_to_file|replace_file_content|multi_replace_file_content",
        "hooks": [
          { "type": "command", "command": "wikeeper hook guard --agent antigravity", "timeout": 10 }
        ]
      }
    ]
  }
}
```

### Hook command resolution (affects 002-06 R5)

Hook commands are shell strings, and none of the three agents documents adding `node_modules/.bin` to `PATH`. If the binary is only in `node_modules/.bin`, write a full path:

| Agent | Documented way to build the path | Source |
|---|---|---|
| Claude | `$CLAUDE_PROJECT_DIR` | https://code.claude.com/docs/en/hooks |
| Codex | `$(git rev-parse --show-toplevel)` | https://learn.chatgpt.com/docs/hooks#config-shape |
| Antigravity | None documented. The hook's working directory is **UNVERIFIED**. | https://antigravity.google/docs/hooks |

---

## D. Permission and command rules

### D1. Claude: confirmed, both syntaxes work
Source for this section: https://code.claude.com/docs/en/permissions#wildcard-patterns

**Wildcard syntax:**
- `Bash(npx wikeeper *)` is valid and is the preferred form. "The permission dialog writes the space-separated form."
- "The `:*` suffix is an equivalent way to write a trailing wildcard". It is recognised only at the end of a pattern.
- "A `*` at the end, with a space before it, also matches the bare command", so `Bash(npx wikeeper *)` also matches `npx wikeeper`.

**Evaluation:**
- Rules are evaluated in the order deny, then ask, then allow. Source: https://code.claude.com/docs/en/permissions#manage-permissions
- Compound commands are split, and each part must match. Source: https://code.claude.com/docs/en/permissions#compound-commands
- `npx` is **not** a stripped wrapper, so `npx -y wikeeper@1.2.3 …` does not match `Bash(npx wikeeper *)`. Source: https://code.claude.com/docs/en/permissions#process-wrappers

**Trust:** `permissions.allow` from project settings applies only after workspace trust; `deny` and `ask` rules apply right away. Source: https://code.claude.com/docs/en/settings

### D2. Codex: confirmed, with caveats
Source for this section: https://learn.chatgpt.com/docs/agent-configuration/rules

**Location:**
- Use a `.rules` file in a `rules/` folder next to an active config layer.
- "Project-local rules under `<repo>/.codex/rules/` load only when the project `.codex/` layer is trusted."
- So `.codex/rules/wikeeper.rules` is valid. The `.rules` extension and the Starlark language are confirmed.

**Fields:**
- `pattern` is required. Each element is a literal or a union list.
- `decision` is one of `"allow"` (the default), `"prompt"` or `"forbidden"`. When several rules match, the strictest wins: `forbidden > prompt > allow`.
- `justification`, `match` and `not_match` are optional.

**What the rules control:**
- "Use rules to control which commands Codex can run **outside the sandbox**."
- `allow` means "Run the command outside the sandbox without prompting".
- `prompt` means "Prompt before each matching invocation".
- "Rules are experimental and may change."

**Matching:**
- Codex matches the argv prefix exactly, so `["npx","wikeeper"]` does not match `wikeeper …` or `npx -y wikeeper@x …`. Add `prefix_rule(pattern=["wikeeper"], …)`.
- A `bash -lc` script is split only when it is a plain linear chain of commands.

**Testing:** `codex execpolicy check --rules .codex/rules/wikeeper.rules -- npx wikeeper ingest start x` shows the decision for a command.

### D3. Antigravity: no rules file in the repo is correct, but project-scope rules exist
**Global CLI rules:**
- Global CLI rules live in `~/.gemini/antigravity-cli/settings.json` under `permissions.{allow,ask,deny}`.
- The rule syntax is `action(target)`, for example `command(npx wikeeper ingest start)`. `command(prefix)` matches word by word, and `regex:` is supported.
- Source: https://antigravity.google/docs/permissions#antigravity-cli

**Project scope exists, but outside the repo:**
- The `/permissions` scope picker offers **Project**, **Shared** and **Global**. Source: https://antigravity.google/docs/cli/commands/permissions
- The app has "Project-level permissions". Source: https://antigravity.google/docs/settings
- They are stored outside the repo. CLI v1.0.12 says: "project-specific configurations (located in `~/.gemini/config/projects/`) take precedence over global settings". Source: https://antigravity.google/docs/changelog
- `.agents/settings.json` is no longer read (App v2.23.0), and per-project config moved to `.gemini/config.json`. That file is documented only for `personal_customization_dir`, not for permissions. Source: https://antigravity.google/docs/changelog
- **Result:** there is no documented permission-rules file inside the repo, so the story's decision stands. The R8 note should say "project rules live in your Antigravity profile (`/permissions` → Project)".

---

## E. Skills, sub-agents and instruction files

### Skills

| Agent | What the docs say | Source |
|---|---|---|
| Claude | `.claude/skills/<name>/SKILL.md` is confirmed. Claude reads symlinked skill folders. `description` plus `when_to_use` is capped at 1,536 characters. Claude does **not** read `.agents/`, so the symlink or copy step is needed. | https://code.claude.com/docs/en/skills and https://code.claude.com/docs/en/memory#agents-md |
| Codex | `.agents/skills/<name>/SKILL.md` is confirmed. Codex scans from the working directory up to the repo root. `name` and `description` are required. The initial skills list uses at most 2% of the context window. | https://learn.chatgpt.com/docs/build-skills |
| Antigravity | `<workspace-root>/.agents/skills/<folder>/` is confirmed for the App, CLI and IDE. The legacy `.agent/skills` still works. `name` and `description` are in the frontmatter. | https://antigravity.google/docs/skills |

### Sub-agents

| Agent | What the docs say | Source |
|---|---|---|
| Claude | `.claude/agents/*.md` is confirmed. `name` and `description` are required. `model` accepts `sonnet`, `opus`, `haiku`, `fable`, a full model ID, or `inherit`. | https://code.claude.com/docs/en/sub-agents#supported-frontmatter-fields |
| Codex | `.codex/agents/*.toml` is confirmed. `name`, `description` and `developer_instructions` are required. `model` is an optional model-id string. `model_reasoning_effort` is optional. | https://learn.chatgpt.com/docs/agent-configuration/subagents |
| Antigravity | `.agents/agents/<name>.md` or `.agents/agents/<name>/agent.md` is confirmed. `name` and `description` are required. `model` accepts only `inherit`, `flash` or `pro`, default `inherit`. `mainAgent` and `subagent` both default to `true`. | https://antigravity.google/docs/subagents |

### Instruction files

| Agent | What the docs say | Source |
|---|---|---|
| Claude | Reads `CLAUDE.md` or `.claude/CLAUDE.md`. Reads `AGENTS.md` **only when no `CLAUDE.md`** exists in the working directory or above it (v2.1.277+). A `CLAUDE.md` is loaded in full up to 4 MiB and skipped if larger; the recommendation is under 200 lines. | https://code.claude.com/docs/en/memory |
| Codex | Reads `AGENTS.override.md`, then `AGENTS.md`, then any fallback names, at most one file per directory. The combined size cap is `project_doc_max_bytes` = 32 KiB. | https://learn.chatgpt.com/docs/agent-configuration/agents-md |
| Antigravity | Reads `AGENTS.md` **and** `GEMINI.md` (also under `.agents/`) and `.agents/rules/*.md`. Each file is truncated at 24,000 bytes, and all rules share a 20,000-token budget. | https://antigravity.google/docs/rules#size-limits-and-token-budgets |

### Product status

- **Gemini CLI:** stopped serving AI Pro, Ultra and free individual users on 2026-06-18. It is still available to Code Assist Standard and Enterprise users and through paid API keys. Source: https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/
- **Antigravity CLI:** reads `GEMINI.md` and `AGENTS.md` without changes, and moved workspace skills to `.agents/skills/`. Source: https://antigravity.google/docs/cli/gcli-migration
- **Antigravity IDE workflows:** "Current workflows will stop working on **October 19, 2026**". On 2026-10-16 they still exist. Skills replace them. Source: https://antigravity.google/docs/ide/workflows
- **What remains in Antigravity:** hooks, skills, rules, custom sub-agents and permissions are all documented for the App, CLI and IDE.
