// Contract C9 lint hook point (STORY-003-09 R8). EPIC-005 registers the real hook in SPRINT-03; the default is none.
import type { ResolvedPaths } from "../core/paths.js";

export interface LintFinding {
  id: string;
  severity: "info" | "warning" | "error";
  message: string;
  path?: string;
}
export interface LintHookContext {
  paths: ResolvedPaths;
  sourceId: string;
  changed: string[]; // created ∪ updated, relative to pages/
}
export type LintHook = (ctx: LintHookContext) => Promise<LintFinding[]>;

let current: LintHook | null = null;

export function setLintHook(hook: LintHook | null): void {
  current = hook;
}

export async function runLintHook(ctx: LintHookContext): Promise<LintFinding[]> {
  return current === null ? [] : await current(ctx);
}
