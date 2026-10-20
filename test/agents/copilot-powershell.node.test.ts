import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { COPILOT_ENFORCE } from "../../src/agents/enforce/copilot.js";
import { guardCommand, type GuardForm } from "../../src/agents/enforce/guard-command.js";
import { npmVersion } from "../../src/core/version.js";

// CR-010: Copilot CLI runs an entry's `powershell` field on Windows and VS Code its `windows` field;
// `command` is the POSIX form. Each PowerShell form calls npm's .cmd shim, because PowerShell picks the
// .ps1 shim for a bare name and Windows PowerShell's default policy refuses scripts.

const VERSION = "0.4.0";
const FORMS: GuardForm[] = ["path", "npx", "local"];

interface Entry {
  command: string;
  powershell: string;
  windows: string;
}
function entries(form: GuardForm): { guard: Entry; permit: Entry } {
  const [guard, permit] = COPILOT_ENFORCE.items(guardCommand(form, "copilot", VERSION), "ai")
    .filter((i) => i.identity.startsWith("hooks."))
    .map((i) => (i.value as { hooks: Entry[] }).hooks[0]!);
  return { guard: guard!, permit: permit! };
}

const PS_PREFIX: Record<GuardForm, string> = {
  path: "wikeeper.cmd",
  npx: `npx.cmd -y wikeeper@${npmVersion(VERSION)}`,
  local: '& "$(git rev-parse --show-toplevel)/node_modules/.bin/wikeeper.cmd"',
};

describe("Copilot hook entries carry a Windows command for both hook readers", () => {
  it.each(FORMS)("%s form: powershell and windows hold the PowerShell command", (form) => {
    const { guard, permit } = entries(form);
    expect(guard.powershell).toBe(`${PS_PREFIX[form]} hook guard --agent copilot; exit 0`);
    expect(permit.powershell).toBe(`${PS_PREFIX[form]} hook permit --agent copilot --permission ai; exit 0`);
    expect(guard.windows).toBe(guard.powershell);
    expect(permit.windows).toBe(permit.powershell);
  });

  it.each(FORMS)("%s form: the POSIX command is unchanged", (form) => {
    const cmd = guardCommand(form, "copilot", VERSION);
    const { guard, permit } = entries(form);
    expect(guard.command).toBe(`${cmd} || true`);
    expect(permit.command).toBe(`${cmd.replace(" hook guard ", " hook permit ")} --permission ai || true`);
  });
});

// The integration half runs each PowerShell command in a real PowerShell: pwsh where it is installed
// (every GitHub runner), and Windows PowerShell on Windows. It is skipped where neither exists.
function shellPath(name: string): string | null {
  const r = spawnSync(name, ["-NoProfile", "-NonInteractive", "-Command", "(Get-Process -Id $PID).Path"], {
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true,
  });
  return r.status === 0 && r.stdout.trim() !== "" ? r.stdout.trim() : null;
}
const SHELLS = (process.platform === "win32" ? ["pwsh", "powershell"] : ["pwsh"])
  .map((name) => ({ name, exe: shellPath(name) }))
  .filter((s): s is { name: string; exe: string } => s.exe !== null);
const hasGit = spawnSync("git", ["--version"], { windowsHide: true }).status === 0;

// Every GitHub runner has pwsh, and Windows runners also Windows PowerShell: on CI the runs below must
// not be skipped for want of a shell, or a green job would prove nothing about Windows.
it.runIf(process.env.CI === "true")("finds the PowerShells on CI", () => {
  expect(SHELLS.map((s) => s.name)).toEqual(process.platform === "win32" ? ["pwsh", "powershell"] : ["pwsh"]);
  expect(hasGit).toBe(true);
});

const tmp: string[] = [];
afterAll(() => {
  for (const d of tmp) rmSync(d, { recursive: true, force: true, maxRetries: 3 });
});
function tempDir(): string {
  const d = mkdtempSync(path.join(os.tmpdir(), "wikeeper-ps-"));
  tmp.push(d);
  return d;
}

/** A stub wikeeper: echoes its arguments and the payload in a deny decision, or exits 1 with no output. */
function writeStub(dir: string, name: string, script: string): void {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  if (process.platform === "win32") writeFileSync(file, `@"${process.execPath}" "${script}" %*\r\n`);
  else {
    writeFileSync(file, `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`);
    chmodSync(file, 0o755);
  }
}
function stubScript(dir: string): string {
  const file = path.join(dir, "stub.cjs");
  writeFileSync(
    file,
    [
      "let s = '';",
      "process.stdin.on('data', (c) => (s += c));",
      "process.stdin.on('end', () => {",
      "  if (process.env.STUB_MARKER) require('fs').writeFileSync(process.env.STUB_MARKER, s);",
      "  if (process.env.STUB_EXIT) process.exit(Number(process.env.STUB_EXIT));",
      "  process.stdout.write(JSON.stringify({ permissionDecision: 'deny', permissionDecisionReason: 'stub',",
      "    args: process.argv.slice(2), payload: JSON.parse(s) }));",
      "});",
    ].join("\n"),
  );
  return file;
}

/** The environment with PATH replaced; Windows spells it Path, so every case-variant is dropped first. */
function withPath(dirs: string[], extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (k.toUpperCase() !== "PATH") env[k] = v;
  env.PATH = dirs.join(path.delimiter);
  return { ...env, ...extra };
}

const PAYLOAD = { tool_name: "Write", tool_input: { file_path: "wiki/pages/x.md", content: "x" } };

function run(exe: string, command: string, cwd: string, env: NodeJS.ProcessEnv) {
  return spawnSync(exe, ["-NoProfile", "-NonInteractive", "-Command", command], {
    cwd,
    env,
    input: JSON.stringify(PAYLOAD),
    encoding: "utf8",
    timeout: 60_000,
    windowsHide: true,
  });
}

describe.skipIf(SHELLS.length === 0 || !hasGit)("Copilot's PowerShell commands run in PowerShell", () => {
  const cases = SHELLS.flatMap((s) =>
    FORMS.flatMap((form) => (["guard", "permit"] as const).map((hook) => ({ shell: s.name, exe: s.exe, form, hook }))),
  );

  it.each(cases)("$shell, $form form, $hook: the payload reaches wikeeper and its decision passes through", ({ exe, form, hook }) => {
    const repo = tempDir();
    expect(spawnSync("git", ["init", "-q"], { cwd: repo, windowsHide: true }).status).toBe(0);
    const script = stubScript(repo);
    const bin = path.join(repo, "stub-bin");
    if (form === "local") writeStub(path.join(repo, "node_modules", ".bin"), "wikeeper.cmd", script);
    else writeStub(bin, form === "npx" ? "npx.cmd" : "wikeeper.cmd", script);

    const r = run(exe, entries(form)[hook].powershell, repo, withPath([bin, process.env.PATH ?? ""]));
    expect(r.status, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout.trim()) as { permissionDecision: string; args: string[]; payload: unknown };
    expect(out.permissionDecision).toBe("deny");
    expect(out.payload).toEqual(PAYLOAD);
    const tail = hook === "guard" ? ["hook", "guard", "--agent", "copilot"] : ["hook", "permit", "--agent", "copilot", "--permission", "ai"];
    expect(out.args).toEqual(form === "npx" ? ["-y", `wikeeper@${npmVersion(VERSION)}`, ...tail] : tail);
  }, 90_000);

  const missing = SHELLS.flatMap((s) => FORMS.map((form) => ({ shell: s.name, exe: s.exe, form })));
  it.each(missing)("$shell, $form form: with no wikeeper the hook exits 0 and prints nothing", ({ exe, form }) => {
    const repo = tempDir();
    const empty = path.join(repo, "empty-bin");
    mkdirSync(empty);
    // Only the shell's own folder stays on PATH, so no wikeeper, npx or git can be found.
    for (const hook of ["guard", "permit"] as const) {
      const r = run(exe, entries(form)[hook].powershell, repo, withPath([empty, path.dirname(exe)]));
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout.trim()).toBe("");
    }
  }, 90_000);

  it.each(SHELLS)("$name: a wikeeper that exits non-zero leaves the call to Copilot", ({ exe }) => {
    const repo = tempDir();
    const bin = path.join(repo, "stub-bin");
    writeStub(bin, "wikeeper.cmd", stubScript(repo));
    const marker = path.join(repo, "stub-ran.json");
    const env = withPath([bin, process.env.PATH ?? ""], { STUB_EXIT: "1", STUB_MARKER: marker });
    const r = run(exe, entries("path").guard.powershell, repo, env);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe("");
    // The stub ran and got the payload: the exit 0 above is the hook's, not a stub that was never found.
    expect(JSON.parse(readFileSync(marker, "utf8"))).toEqual(PAYLOAD);
  }, 90_000);
});
