import { accessSync, constants, existsSync, statSync } from "node:fs";
import path from "node:path";
import type { AgentName } from "../agent-names.js";

export type GuardForm = "path" | "local" | "npx";
export interface ResolveGuardOptions {
  root: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  isExecutable?: (file: string) => boolean;
}

function defaultIsExecutable(platform: NodeJS.Platform): (file: string) => boolean {
  return (file) => {
    try {
      if (!statSync(file).isFile()) return false;
      if (platform === "win32") return true;
      accessSync(file, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  };
}

function envValue(env: NodeJS.ProcessEnv, name: string, win: boolean): string | undefined {
  if (env[name] !== undefined) return env[name];
  if (!win) return undefined;
  const key = Object.keys(env).find((k) => k.toUpperCase() === name);
  return key === undefined ? undefined : env[key];
}

/** First match wins: bare `wikeeper` on PATH, then the project's node_modules/.bin, then npx. */
export function resolveGuardForm(o: ResolveGuardOptions): GuardForm {
  const platform = o.platform ?? process.platform;
  const win = platform === "win32";
  const env = o.env ?? process.env;
  const isExec = o.isExecutable ?? defaultIsExecutable(platform);
  const p = win ? path.win32 : path;

  const rawPath = envValue(env, "PATH", win) ?? "";
  const exts = win
    ? [
        "",
        ...(envValue(env, "PATHEXT", win) ?? ".COM;.EXE;.BAT;.CMD")
          .split(";")
          .filter(Boolean)
          .flatMap((e) => [e, e.toLowerCase()]),
      ]
    : [""];
  for (const dir of rawPath.split(win ? ";" : ":")) {
    if (dir === "") continue;
    const segs = dir.split(/[\\/]+/).filter(Boolean).map((s) => (win ? s.toLowerCase() : s));
    // npm/npx prepend these while `npx wikeeper init` runs; they are absent when the agent later runs the hook.
    if (segs.length >= 2 && segs[segs.length - 2] === "node_modules" && segs[segs.length - 1] === ".bin") continue;
    for (const ext of exts) if (isExec(p.join(dir, "wikeeper" + ext))) return "path";
  }
  if (existsSync(path.join(o.root, "node_modules", ".bin", win ? "wikeeper.cmd" : "wikeeper"))) return "local";
  return "npx";
}

export function guardCommand(form: GuardForm, agent: AgentName, packageVersion: string): string {
  const tail = `hook guard --agent ${agent}`;
  switch (form) {
    case "path":
      return `wikeeper ${tail}`;
    case "local":
      return agent === "claude"
        ? `"$CLAUDE_PROJECT_DIR"/node_modules/.bin/wikeeper ${tail}`
        : `"$(git rev-parse --show-toplevel)"/node_modules/.bin/wikeeper ${tail}`;
    case "npx":
      return `npx -y wikeeper@${packageVersion} ${tail}`;
  }
}
