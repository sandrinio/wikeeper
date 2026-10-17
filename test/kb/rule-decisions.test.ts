import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";
import { writeLogEvent } from "../../src/ingest/log.js";
import { KB_PROPOSAL_SECTION_KEYS } from "../../src/kb/parse-instructions.js";
import { fingerprint, listDecisions, readDecisions, recordDecision } from "../../src/kb/rule-decisions.js";

const dirs: string[] = [];
afterEach(async () => {
  while (dirs.length) await rm(dirs.pop()!, { recursive: true, force: true });
});
async function paths() {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-rd-"));
  dirs.push(root);
  return resolvePaths(root, DEFAULT_CONFIG);
}
let n = 0;
const at = () => new Date(Date.parse("2026-10-17T10:00:00.000Z") + 60_000 * n++).toISOString();

describe("rule-decisions", () => {
  it("R1 vectors and normalisation", () => {
    expect(fingerprint("Meeting-Notes", "  Track   attendees ")).toBe("86420d5cacb9");
    expect(fingerprint("status-report", "Track attendees")).toBe("fba15d33735a");
    expect(fingerprint("status-report (v2)", "TRACK  attendees")).toBe("fba15d33735a");
  });

  it("previouslyRejected only from earlier events", async () => {
    const p = await paths();
    const first = await recordDecision(p, { kind: "status-report", summary: "Track attendees", decision: "rejected", at: at() });
    expect(first.previouslyRejected).toBe(false);
    const second = await recordDecision(p, { kind: "status-report", summary: "track  attendees", decision: "accepted", at: at() });
    expect(second.previouslyRejected).toBe(true);
    const { decisions } = await readDecisions(p);
    expect(decisions.map((d) => d.previously_rejected)).toEqual([false, true]);
  });

  it("stores normalised kind and summary", async () => {
    const p = await paths();
    const res = await recordDecision(p, { kind: "Status-Report", summary: "  a   b ", decision: "accepted", at: at() });
    const text = await readFile(path.join(p.root, res.file), "utf8");
    expect(text).toContain("kind: status-report");
    expect(text).toContain("summary: a b");
    expect((await listDecisions(p))[0]!.summary).toBe("a b");
  });

  it("skips events that are not rule decisions", async () => {
    const p = await paths();
    await writeLogEvent(p, { type: "rule-proposal", at: at(), summary: "x" } as never);
    await writeLogEvent(p, { type: "rule-proposal", at: at(), kind: "status-report", summary: "x", decision: "maybe" } as never);
    await recordDecision(p, { kind: "status-report", summary: "ok", decision: "accepted", at: at() });
    const r = await readDecisions(p);
    expect(r.decisions).toHaveLength(1);
    expect(r.skipped).toHaveLength(2);
  });

  it("summaryLine: new form and SPRINT-02 fallback", async () => {
    const p = await paths();
    const a = await recordDecision(p, { kind: "status-report", summary: "s1", decision: "rejected", at: at() });
    expect(await readFile(path.join(p.root, a.file), "utf8")).toContain("Rule proposal rejected for status-report: s1\n");
    const f1 = await writeLogEvent(p, { type: "rule-proposal", at: at(), summary: "old" } as never);
    expect(await readFile(path.join(p.root, f1), "utf8")).toMatch(/\nRule proposal: old\n$/);
    const f2 = await writeLogEvent(p, { type: "rule-proposal", at: at() } as never);
    expect(await readFile(path.join(p.root, f2), "utf8")).toMatch(/\nRule proposal\n$/);
  });

  it("validates input; five proposal keys accepted, others refused", async () => {
    const p = await paths();
    for (const k of KB_PROPOSAL_SECTION_KEYS) {
      await expect(recordDecision(p, { kind: k, summary: "s", decision: "accepted", at: at() })).resolves.toBeDefined();
    }
    for (const k of ["source-kinds", "rule-changelog", "Bad Kind!"]) {
      await expect(recordDecision(p, { kind: k, summary: "s", decision: "accepted", at: at() })).rejects.toMatchObject({ code: "usage" });
    }
    await expect(recordDecision(p, { kind: "questions", summary: "  ", decision: "accepted", at: at() })).rejects.toMatchObject({ code: "usage" });
    await expect(recordDecision(p, { kind: "questions", summary: "s", decision: "accepted", sourceId: "nope", at: at() })).rejects.toMatchObject({ code: "usage" });
  });
});
