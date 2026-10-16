import { execFile } from "node:child_process";

export interface IgnoreRule {
  source: string;
  line: number;
  pattern: string;
  negated: boolean;
}
export type GitRunner = (
  args: string[],
  cwd: string,
  input?: string,
) => Promise<{ code: number; stdout: string } | "missing">;
export interface Git {
  inWorkTree(): Promise<boolean | "missing">;
  isTracked(relPosix: string): Promise<boolean>;
  ignoreRule(relPosix: string): Promise<IgnoreRule | null>;
}

const GIT_TIMEOUT_MS = 10_000;

/** The only place wikeeper starts git: no shell, bounded time, no console window on Windows. */
export const execFileRunner: GitRunner = (args, cwd, input) =>
  new Promise((resolve) => {
    const child = execFile(
      "git",
      args,
      { cwd, timeout: GIT_TIMEOUT_MS, windowsHide: true, encoding: "utf8" },
      (err, stdout) => {
        if (err === null) return resolve({ code: 0, stdout });
        const e = err as NodeJS.ErrnoException & { code?: string | number };
        if (e.code === "ENOENT") return resolve("missing");
        resolve({ code: typeof e.code === "number" ? e.code : 128, stdout: typeof stdout === "string" ? stdout : "" });
      },
    );
    if (input !== undefined) {
      child.stdin?.on("error", () => {});
      child.stdin?.end(input);
    }
  });

export function createGit(root: string, run: GitRunner = execFileRunner): Git {
  return {
    async inWorkTree() {
      const r = await run(["rev-parse", "--is-inside-work-tree"], root);
      if (r === "missing") return "missing";
      return r.code === 0 && r.stdout.trim() === "true";
    },
    async isTracked(relPosix) {
      const r = await run(["ls-files", "--error-unmatch", "--", relPosix], root);
      return r !== "missing" && r.code === 0;
    },
    async ignoreRule(relPosix) {
      const r = await run(["check-ignore", "-v", "-n", "-z", "--no-index", "--stdin"], root, relPosix + "\0");
      if (r === "missing" || (r.code !== 0 && r.code !== 1)) return null;
      const [source = "", line = "", pattern = ""] = r.stdout.split("\0");
      if (pattern === "") return null;
      return { source, line: Number(line), pattern, negated: pattern.startsWith("!") };
    },
  };
}
