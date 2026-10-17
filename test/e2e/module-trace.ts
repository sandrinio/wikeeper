import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Runs the CLI under a module-resolution hook and returns every resolved module URL (as a path-like string). */
export async function traceCli(
  cli: string,
  args: string[],
  cwd: string,
): Promise<{ code: number | null; stdout: string; stderr: string; resolved: string[] }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "wk-trace-"));
  try {
    const out = path.join(dir, "resolved.txt");
    await writeFile(
      path.join(dir, "hooks.mjs"),
      `import { appendFileSync } from "node:fs";
let out;
export function initialize(data) { out = data.out; }
export async function resolve(specifier, context, next) {
  const r = await next(specifier, context);
  appendFileSync(out, r.url + "\\n");
  return r;
}
`,
    );
    await writeFile(
      path.join(dir, "register.mjs"),
      `import { register } from "node:module";
register("./hooks.mjs", import.meta.url, { data: { out: ${JSON.stringify(out)} } });
`,
    );
    const r = spawnSync(process.execPath, ["--import", pathToFileURL(path.join(dir, "register.mjs")).href, cli, ...args], {
      cwd,
      encoding: "utf8",
    });
    let text = "";
    try {
      text = await readFile(out, "utf8");
    } catch {
      text = "";
    }
    return {
      code: r.status,
      stdout: r.stdout ?? "",
      stderr: r.stderr ?? "",
      resolved: text.split("\n").filter(Boolean),
    };
  } finally {
    await rm(dir, { recursive: true, force: true, maxRetries: 3 });
  }
}
