import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";
import { FINAL_STATUSES, staleFactCheck } from "../../src/lint/staleness.js";
import type { LintContext } from "../../src/lint/checks.js";
import { parsePage } from "../../src/wiki/parse-page.js";

const NOW = new Date("2026-11-20T12:00:00Z");

function ctxOf(text: string, opts: { days?: number; contentDir?: string; file?: string } = {}): LintContext {
  const config = {
    ...DEFAULT_CONFIG,
    ...(opts.contentDir ? { content_dir: opts.contentDir } : {}),
    lint: { ...DEFAULT_CONFIG.lint, stale_after_days: opts.days ?? 30 },
  } as typeof DEFAULT_CONFIG;
  return { paths: resolvePaths("/repo", config), config, pages: [parsePage(text, opts.file ?? "atlas.md")], kb: null, log: [], now: NOW };
}
const run = (text: string, o?: Parameters<typeof ctxOf>[1]) => staleFactCheck.run(ctxOf(text, o));
const F = (d: string, k: string, t: string) => `- ${d} · ${k} · ${t} [[src-2026-10-01-hr]]`;

describe("stale-fact", () => {
  it("is a pages warning with the frozen final list", () => {
    expect([staleFactCheck.id, staleFactCheck.severity, staleFactCheck.scope]).toEqual(["stale-fact", "warning", "pages"]);
    expect(FINAL_STATUSES).toHaveLength(12);
  });

  it("age boundary: 30 not stale, 31 stale, future not stale", async () => {
    const mk = (d: string) => `# Atlas\nstatus:: Open\n\n## Facts\n\n${F(d, "decided", "x.")}\n`;
    expect(await run(mk("2026-10-21"))).toEqual([]);
    expect(await run(mk("2026-10-20"))).toHaveLength(1);
    expect(await run(mk("2026-12-01"))).toEqual([]);
  });

  it("status sources: last link, frontmatter fallback, key case-insensitive", async () => {
    const facts = `\n## Facts\n\n${F("2026-10-01", "decided", "x.")}\n`;
    const a = await run(`# Atlas\nstatus:: Completed\nStatus:: Draft\n${facts}`);
    expect(a[0]!.message).toContain('"Draft"');
    const b = await run(`---\nStatus: Draft\n---\n# Atlas\n${facts}`);
    expect(b).toHaveLength(1);
    expect(b[0]!.line).toBeUndefined();
  });

  it("final matching: first word, wikilinked, no letters judged", async () => {
    const facts = `\n## Facts\n\n${F("2026-10-01", "decided", "x.")}\n`;
    expect(await run(`# Atlas\nstatus:: Done — shipped early\n${facts}`)).toEqual([]);
    expect(await run(`# Atlas\nstatus:: [[Cancelled]]\n${facts}`)).toEqual([]);
    expect(await run(`# Atlas\nstatus:: 123\n${facts}`)).toHaveLength(1);
  });

  it("planned date: wikilink date ignored, impossible date, later fact, decided, no facts", async () => {
    const t = (...f: string[]) => `# Atlas\n\n## Facts\n\n${f.join("\n")}\n`;
    expect(await run(t("- 2026-10-15 · tentative · Plan. [[src-2026-10-15-plan]]"))).toEqual([]);
    expect(await run(t(F("2026-10-01", "tentative", "On 2026-02-30.")))).toEqual([]);
    expect(await run(t(F("2026-10-01", "decided", "On 2026-11-17.")))).toEqual([]);
    expect(
      await run(t(F("2026-10-15", "tentative", "Launch 2026-11-17."), F("2026-11-01", "decided", "y."))),
    ).toEqual([]);
    expect(await run("# Atlas\nstatus:: Open\n")).toEqual([]);
    const hit = await run(t(F("2026-10-15", "tentative", "Launch 2026-11-17.")));
    expect(hit).toHaveLength(1);
    expect(hit[0]!.message).toContain("names 2026-11-17");
  });

  it("finding path follows content_dir", async () => {
    const r = await run(`# Atlas\nstatus:: Open\n\n## Facts\n\n${F("2026-10-01", "decided", "x.")}\n`, {
      contentDir: "docs/kb",
      file: "projects/atlas.md",
    });
    expect(r[0]!.path).toBe("docs/kb/pages/projects/atlas.md");
  });
});
