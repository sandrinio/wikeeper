import type { CliIO } from "./output.js";
import type { WikeeperConfig } from "./config.js";
import type { ResolvedPaths } from "./paths.js";
import type { Manifest } from "./manifest.js";

export type IntegrationPhase = "init" | "update" | "remove" | "doctor" | "prepare";
export type DoctorSeverity = "ok" | "info" | "warning" | "error";
export interface DoctorCheck {
  id: string; // stable kebab-case
  severity: DoctorSeverity;
  message: string; // one line, no trailing newline
  fix?: string; // one imperative line
  file?: string; // posix path relative to root
}
export type DoctorFinding = DoctorCheck;
export interface IntegrationOptions {
  // init flags: { profile: string; agents?: string; yes?: boolean; enforce?: boolean }
  flags: Readonly<Record<string, unknown>>;
  json: boolean;
  // init: ctx.isTTY && !ctx.json && !flags.yes; update/remove/doctor: ctx.isTTY && !ctx.json
  interactive: boolean;
  io: CliIO;
  manifest: Manifest;
  templatesDir: string;
  packageVersion: string;
}
export interface IntegrationContext {
  root: string;
  paths: ResolvedPaths;
  config: WikeeperConfig;
  options: IntegrationOptions;
}
export interface PhaseReport {
  created?: string[];
  replaced?: string[];
  skipped?: string[];
  removed?: string[];
  backed_up?: string[];
  kept?: string[];
  warnings?: string[];
}
export type PhaseHandler = (ctx: IntegrationContext) => PhaseReport | void | Promise<PhaseReport | void>;
export type DoctorHandler = (ctx: IntegrationContext) => DoctorCheck[] | Promise<DoctorCheck[]>;
export interface Integration {
  name: string;
  /** init only, before the first write: may prompt and throw; never writes. */
  prepare?: (ctx: IntegrationContext) => Promise<void>;
  init?: PhaseHandler;
  update?: PhaseHandler;
  remove?: PhaseHandler;
  doctor?: DoctorHandler;
}
export interface IntegrationRunResult {
  created: string[];
  replaced: string[];
  skipped: string[];
  removed: string[];
  backed_up: string[];
  kept: string[];
  warnings: string[];
  checks: DoctorCheck[];
}

const registry: Integration[] = [];

export function registerIntegration(integration: Integration): void {
  if (registry.some((i) => i.name === integration.name)) {
    throw Object.assign(new Error(`integration "${integration.name}" is already registered`), {
      code: "E_INTEGRATION_DUPLICATE",
    });
  }
  registry.push(integration);
}

export async function runIntegrations(
  phase: IntegrationPhase,
  ctx: IntegrationContext,
): Promise<IntegrationRunResult> {
  const result: IntegrationRunResult = {
    created: [],
    replaced: [],
    skipped: [],
    removed: [],
    backed_up: [],
    kept: [],
    warnings: [],
    checks: [],
  };
  const ordered = phase === "remove" ? [...registry].reverse() : [...registry];
  for (const integration of ordered) {
    if (phase === "prepare") {
      if (integration.prepare) await integration.prepare(ctx);
      continue;
    }
    if (phase === "doctor") {
      const handler = integration.doctor;
      if (!handler) continue;
      try {
        result.checks.push(...(await handler(ctx)));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.checks.push({
          id: `integration-${integration.name}`,
          severity: "error",
          message: `doctor handler failed: ${msg}`,
        });
      }
      continue;
    }
    const handler = integration[phase];
    if (!handler) continue;
    const report = await handler(ctx);
    if (!report) continue;
    result.created.push(...(report.created ?? []));
    result.replaced.push(...(report.replaced ?? []));
    result.skipped.push(...(report.skipped ?? []));
    result.removed.push(...(report.removed ?? []));
    result.backed_up.push(...(report.backed_up ?? []));
    result.kept.push(...(report.kept ?? []));
    result.warnings.push(...(report.warnings ?? []));
  }
  return result;
}

export function resetIntegrations(): void {
  registry.length = 0;
}
