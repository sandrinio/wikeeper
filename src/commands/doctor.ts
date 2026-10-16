import { stat } from "node:fs/promises";
import type { Command } from "commander";
import { DEFAULT_CONFIG, formatConfigIssue, loadConfig } from "../core/config.js";
import type { WikeeperConfig } from "../core/config.js";
import { ExitCode } from "../core/exit-codes.js";
import { runIntegrations } from "../core/integrations.js";
import type { DoctorCheck, IntegrationContext, IntegrationOptions } from "../core/integrations.js";
import { diffManifest, readManifest } from "../core/manifest.js";
import type { Manifest } from "../core/manifest.js";
import { emitResult, getOutputContext } from "../core/output.js";
import { findRepoRoot, resolvePaths } from "../core/paths.js";
import type { ResolvedPaths } from "../core/paths.js";
import { readPackageVersion, templatesDir } from "../core/templates.js";
import type { CommandModule } from "../program.js";

export interface DoctorResult {
  checks: DoctorCheck[];
  errors: number;
  warnings: number;
}

export const MIN_NODE_VERSION = "22.12.0";

export function compareVersions(a: string, b: string): number | null {
  const re = /^v?(\d+)\.(\d+)\.(\d+)/;
  const ma = re.exec(a);
  const mb = re.exec(b);
  if (!ma || !mb) return null;
  for (let i = 1; i <= 3; i++) {
    const d = Number(ma[i]) - Number(mb[i]);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export function checkNodeVersion(version: string): DoctorCheck {
  const cmp = compareVersions(version, MIN_NODE_VERSION);
  if (cmp === null) {
    return { id: "node-version", severity: "warning", message: `Node version "${version}" could not be parsed` };
  }
  if (cmp < 0) {
    return {
      id: "node-version",
      severity: "error",
      message: `Node ${version} is older than ${MIN_NODE_VERSION}`,
      fix: "install Node.js 22.12 or newer",
    };
  }
  return { id: "node-version", severity: "ok", message: `Node ${version}` };
}

type Run = Pick<IntegrationOptions, "flags" | "json" | "interactive" | "io">;

const EMPTY_MANIFEST: Manifest = { package_version: "", files: [] };

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Doctor reports problems rather than failing on them, so an unreadable package version becomes "". */
function packageVersionOrEmpty(): string {
  try {
    return readPackageVersion();
  } catch {
    return "";
  }
}

export async function runDoctor(root: string, run: Run, deps: { nodeVersion?: string } = {}): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];
  const guard = async (id: string, fn: () => Promise<DoctorCheck | DoctorCheck[]> | DoctorCheck | DoctorCheck[]) => {
    try {
      const r = await fn();
      checks.push(...(Array.isArray(r) ? r : [r]));
    } catch (err) {
      checks.push({ id, severity: "error", message: `check failed: ${errMsg(err)}` });
    }
  };

  let config: WikeeperConfig = structuredClone(DEFAULT_CONFIG) as WikeeperConfig;
  let paths: ResolvedPaths = resolvePaths(root, config);
  let manifest: Manifest | null = null;
  let manifestError: string | null = null;

  await guard("node-version", () => checkNodeVersion(deps.nodeVersion ?? process.versions.node));

  await guard("wiki-initialised", async () => {
    try {
      manifest = await readManifest(paths.manifestFile);
    } catch (err) {
      if ((err as { code?: string }).code === "E_MANIFEST_INVALID") {
        manifestError = errMsg(err);
        return {
          id: "wiki-initialised",
          severity: "error",
          message: `manifest is invalid: ${manifestError}`,
          fix: "delete .wiki/system/manifest.json and run wikeeper init",
        };
      }
      throw err;
    }
    if (manifest === null) {
      return {
        id: "wiki-initialised",
        severity: "error",
        message: "wiki is not initialised",
        fix: "run wikeeper init",
      };
    }
    return { id: "wiki-initialised", severity: "ok", message: "manifest found" };
  });

  await guard("config-valid", async () => {
    const file = ".wiki/config.yml";
    try {
      await stat(paths.configFile);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return {
          id: "config-valid",
          severity: "error",
          message: "the config file is missing",
          fix: "run wikeeper init",
          file,
        };
      }
      throw err;
    }
    let loaded;
    try {
      loaded = await loadConfig(root);
    } catch (err) {
      if ((err as { code?: string }).code === "E_CONFIG_SYNTAX") {
        return {
          id: "config-valid",
          severity: "error",
          message: errMsg(err),
          fix: "fix the YAML syntax in .wiki/config.yml",
          file,
        };
      }
      throw err;
    }
    config = loaded.config;
    paths = resolvePaths(root, config);
    if (loaded.errors.length > 0) {
      return {
        id: "config-valid",
        severity: "error",
        message: loaded.errors.map(formatConfigIssue).join("; "),
        fix: "edit .wiki/config.yml",
        file,
      };
    }
    if (loaded.warnings.length > 0) {
      return {
        id: "config-valid",
        severity: "warning",
        message: loaded.warnings.map(formatConfigIssue).join("; "),
        fix: "edit .wiki/config.yml",
        file,
      };
    }
    return { id: "config-valid", severity: "ok", message: "no issues", file };
  });

  await guard("manifest-drift", async () => {
    const m = manifest as Manifest | null;
    if (m === null) {
      return {
        id: "manifest-drift",
        severity: "error",
        message: "not checked: wiki is not initialised",
        fix: "run wikeeper init",
      };
    }
    const rows = (await diffManifest(m, root)).filter((r) => r.sha256 !== null);
    const missing = rows.filter((r) => r.status === "missing").map((r) => r.path);
    const modified = rows.filter((r) => r.status === "modified").map((r) => r.path);
    if (missing.length === 0 && modified.length === 0) {
      return { id: "manifest-drift", severity: "ok", message: `${rows.length} package files match the manifest` };
    }
    const parts: string[] = [];
    if (missing.length > 0) parts.push(`missing: ${missing.join(", ")}`);
    if (modified.length > 0) parts.push(`modified: ${modified.join(", ")}`);
    return {
      id: "manifest-drift",
      severity: missing.length > 0 ? "error" : "warning",
      message: parts.join("; "),
      fix: missing.length > 0 ? "run wikeeper init" : "run wikeeper update (it backs up edits)",
    };
  });

  await guard("integrations", async () => {
    let tpl = "";
    try {
      tpl = templatesDir();
    } catch {
      /* integrations get an empty templatesDir when the package root is not found */
    }
    const ctx: IntegrationContext = {
      root,
      paths,
      config,
      options: {
        flags: run.flags,
        json: run.json,
        interactive: run.interactive,
        io: run.io,
        manifest: (manifest as Manifest | null) ?? EMPTY_MANIFEST,
        templatesDir: tpl,
        packageVersion: packageVersionOrEmpty(),
      },
    };
    return (await runIntegrations("doctor", ctx)).checks;
  });

  const errors = checks.filter((c) => c.severity === "error").length;
  const warnings = checks.filter((c) => c.severity === "warning").length;
  return { checks, errors, warnings };
}

const LABEL: Record<DoctorCheck["severity"], string> = { ok: "[ok]", info: "[info]", warning: "[warn]", error: "[error]" };

function render(result: DoctorResult): string[] {
  const lines: string[] = [];
  for (const c of result.checks) {
    lines.push(`${LABEL[c.severity]} ${c.id}: ${c.message}`);
    if (c.fix) lines.push(`  fix: ${c.fix}`);
  }
  lines.push(`${result.errors} errors, ${result.warnings} warnings`);
  return lines;
}

export function createDoctorCommand(deps: { nodeVersion?: string } = {}): CommandModule {
  return {
    register(program: Command): void {
      program
        .command("doctor")
        .description("check that the wiki install is healthy")
        .action(async (_opts: unknown, command: Command) => {
          const ctx = getOutputContext(command);
          const root = findRepoRoot(ctx.cwd);
          const result = await runDoctor(
            root,
            { flags: {}, json: ctx.json, interactive: ctx.isTTY && !ctx.json, io: ctx },
            { nodeVersion: deps.nodeVersion ?? process.versions.node },
          );
          emitResult(ctx, { command: "doctor", data: result, warnings: [], message: render(result) });
          ctx.setExitCode(result.errors > 0 ? ExitCode.ERROR : ExitCode.OK);
        });
    },
  };
}

export const doctorCommand: CommandModule = createDoctorCommand();
