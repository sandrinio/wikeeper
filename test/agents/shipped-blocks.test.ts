import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normaliseBlock } from "../../src/agents/inject.js";
import { SHIPPED_BLOCKS } from "../../src/agents/shipped-blocks.js";

/** sha256 (hex, UTF-8) of every SHIPPED_BLOCKS entry, in order. Append-only (R6). */
const SHIPPED_BLOCK_SHA256: readonly string[] = [
  "4f32351f65f803b265a2bbca697724e6f06738c71680622e8267efc23078fb1b",
  "9bc080837857cacb59c42db9907fad82a148e1c000973d5f08792a7d62295d66",
  "c6fc17d0ef7079d7cf7e6f88f6e5c28e8152cdb74880118167bb29eaf333e168",
];

const sha = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

function checkShippedBlocks(template: string, shipped: readonly string[], pins: readonly string[]): string[] {
  const out: string[] = [];
  if (shipped[shipped.length - 1] !== template) {
    out.push(
      `templates/agent-block.md changed: append its text to SHIPPED_BLOCKS in src/agents/shipped-blocks.ts and its sha256 ${sha(template)} to SHIPPED_BLOCK_SHA256; keep every earlier entry`,
    );
  }
  shipped.forEach((entry, n) => {
    const hash = sha(entry);
    if (pins[n] === undefined) out.push(`SHIPPED_BLOCKS entry ${n} (sha256 ${hash}) is not pinned in SHIPPED_BLOCK_SHA256`);
    const lines = entry.split("\n");
    if (!/^<!-- WIKI:START\b.*-->$/.test(lines[0] ?? "") || lines[lines.length - 1] !== "<!-- WIKI:END -->") {
      out.push(`SHIPPED_BLOCKS entry ${n} is not a well-formed block`);
    }
    if (shipped.slice(0, n).includes(entry)) out.push(`SHIPPED_BLOCKS entry ${n} repeats an earlier entry`);
  });
  pins.forEach((pin, n) => {
    if (shipped[n] === undefined || sha(shipped[n] as string) !== pin) {
      out.push(`pinned shipped block ${n} (sha256 ${pin}) is missing or changed: a shipped block is never edited or removed`);
    }
  });
  return out;
}

const template = normaliseBlock(readFileSync("templates/agent-block.md", "utf8"));
const longer = template.replace("\n<!-- WIKI:END -->", "\nOne more line.\n<!-- WIKI:END -->");

describe("shipped pointer blocks (R6)", () => {
  it("holds the SPRINT-01 and SPRINT-02 blocks with their pinned hashes", () => {
    expect(SHIPPED_BLOCKS.slice(0, 2).map(sha)).toEqual(SHIPPED_BLOCK_SHA256.slice(0, 2));
  });
  it("every block stays in the list and the template is the last entry", () => {
    expect(checkShippedBlocks(template, SHIPPED_BLOCKS, SHIPPED_BLOCK_SHA256)).toEqual([]);
  });
  it("a changed template with the list unchanged is named", () => {
    const m = checkShippedBlocks(longer, SHIPPED_BLOCKS, SHIPPED_BLOCK_SHA256);
    expect(m.some((x) => x.includes("templates/agent-block.md") && x.includes("append its text to SHIPPED_BLOCKS"))).toBe(true);
  });
  it("an appended entry without a pin is named", () => {
    const m = checkShippedBlocks(longer, [...SHIPPED_BLOCKS, longer], SHIPPED_BLOCK_SHA256);
    expect(m).toEqual([`SHIPPED_BLOCKS entry ${SHIPPED_BLOCKS.length} (sha256 ${sha(longer)}) is not pinned in SHIPPED_BLOCK_SHA256`]);
  });
  it("a replaced SPRINT-02 entry is named as missing or changed", () => {
    const shipped = [SHIPPED_BLOCKS[0] as string, longer];
    const m = checkShippedBlocks(longer, shipped, SHIPPED_BLOCK_SHA256);
    expect(m.some((x) => x.startsWith("pinned shipped block 1 ") && x.includes("missing or changed"))).toBe(true);
  });
  it("a malformed or repeated entry is named", () => {
    const m = checkShippedBlocks(template, ["x", "x", template], ["a", "b", "c"]);
    expect(m.some((x) => x.includes("entry 0 is not a well-formed block"))).toBe(true);
    expect(m.some((x) => x.includes("entry 1 repeats an earlier entry"))).toBe(true);
  });
});
