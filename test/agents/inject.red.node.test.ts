import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile, symlink, lstat, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

interface InjectModule {
  WIKI_START_PREFIX: string;
  WIKI_START_V1: string;
  WIKI_END: string;
  injectBlock(text: string, block: string): { text: string; status: string };
  stripBlock(text: string): { text: string; status: string };
  injectIntoFile(p: string, block: string): Promise<{ status: string; created: boolean }>;
  stripFromFile(p: string): Promise<{ status: string }>;
}

// Dynamic import so each scenario fails individually
// against the clean baseline instead of the whole suite failing at load.
async function load(): Promise<InjectModule> {
  return (await import("../../src/agents/inject.js")) as unknown as InjectModule;
}

const START = "<!-- WIKI:START v1 — managed by wikeeper -->";
const END = "<!-- WIKI:END -->";
const BLOCK = `${START}\nSee .wiki/ for the knowledge base.\n${END}\n`;
const BOM = "﻿";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "wikeeper-inject-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("Scenario 1: inject into a plain file", () => {
  it("injectBlock puts block first, one blank line, then original", async () => {
    const m = await load();
    const r = m.injectBlock("# My rules\n", BLOCK);
    expect(r.status).toBe("injected");
    expect(r.text.startsWith(START)).toBe(true);
    expect(r.text).toBe(`${START}\nSee .wiki/ for the knowledge base.\n${END}\n\n# My rules\n`);
  });

  it("injectIntoFile writes the same through the file helper", async () => {
    const m = await load();
    const f = path.join(dir, "AGENTS.md");
    await writeFile(f, "# My rules\n");
    const r = await m.injectIntoFile(f, BLOCK);
    expect(r.status).toBe("injected");
    expect(r.created).toBe(false);
    const out = await readFile(f, "utf8");
    expect(out.startsWith(START)).toBe(true);
    expect(out.endsWith(`${END}\n\n# My rules\n`)).toBe(true);
    expect((await readdir(dir)).filter((n) => n.endsWith(".wikeeper-tmp"))).toEqual([]);
  });

  it("exports the frozen marker constants", async () => {
    const m = await load();
    expect(m.WIKI_START_PREFIX).toBe("<!-- WIKI:START");
    expect(m.WIKI_START_V1).toBe(START);
    expect(m.WIKI_END).toBe(END);
  });
});

describe("Scenario 2: inject then strip restores original bytes", () => {
  const fm = "---\ntitle: x\n---\n";
  const cases: Array<{ name: string; original: string; expected: (eol: string) => string }> = [
    { name: "LF text", original: "# a\nb\n", expected: () => `${START}\nBODY\n${END}\n\n# a\nb\n` },
    {
      name: "CRLF text",
      original: "# a\r\nb\r\n",
      expected: () => `${START}\r\nBODY\r\n${END}\r\n\r\n# a\r\nb\r\n`,
    },
    {
      name: "BOM followed by LF text",
      original: `${BOM}# a\nb\n`,
      expected: () => `${BOM}${START}\nBODY\n${END}\n\n# a\nb\n`,
    },
    {
      name: "YAML frontmatter then text",
      original: `${fm}# a\n`,
      expected: () => `${fm}${START}\nBODY\n${END}\n\n# a\n`,
    },
    { name: "an empty string", original: "", expected: () => `${START}\nBODY\n${END}\n` },
  ];

  for (const c of cases) {
    it(`round-trips: ${c.name}`, async () => {
      const m = await load();
      const block = `${START}\nBODY\n${END}\n`;
      const inj = m.injectBlock(c.original, block);
      expect(inj.status).toBe("injected");
      expect(inj.text).toBe(c.expected("\n"));
      const st = m.stripBlock(inj.text);
      expect(st.status).toBe("stripped");
      expect(st.text).toBe(c.original);
    });
  }

  it("CRLF: no bare LF is introduced", async () => {
    const m = await load();
    const r = m.injectBlock("a\r\nb\r\n", BLOCK);
    expect(r.text.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("mixed EOL uses the style of the first line break (CRLF first)", async () => {
    const m = await load();
    const orig = "a\r\nb\nc\n";
    const r = m.injectBlock(orig, BLOCK);
    expect(r.text).toBe(`${START}\r\nSee .wiki/ for the knowledge base.\r\n${END}\r\n\r\n${orig}`);
    expect(m.stripBlock(r.text).text).toBe(orig);
  });

  it("mixed EOL uses the style of the first line break (LF first)", async () => {
    const m = await load();
    const orig = "a\nb\r\nc\r\n";
    const r = m.injectBlock(orig, BLOCK);
    expect(r.text).toBe(`${START}\nSee .wiki/ for the knowledge base.\n${END}\n\n${orig}`);
    expect(m.stripBlock(r.text).text).toBe(orig);
  });

  it("file without any line break falls back to LF", async () => {
    const m = await load();
    const r = m.injectBlock("just text", BLOCK);
    expect(r.text).toBe(`${START}\nSee .wiki/ for the knowledge base.\n${END}\n\njust text`);
    expect(m.stripBlock(r.text).text).toBe("just text");
  });

  it("frontmatter without a closing --- is treated as no frontmatter", async () => {
    const m = await load();
    const orig = "---\ntitle: x\nbody\n";
    const r = m.injectBlock(orig, BLOCK);
    expect(r.text.startsWith(START)).toBe(true);
    expect(m.stripBlock(r.text).text).toBe(orig);
  });

  it("CRLF frontmatter: block lands right after the closing ---", async () => {
    const m = await load();
    const orig = "---\r\nt: 1\r\n---\r\nbody\r\n";
    const r = m.injectBlock(orig, BLOCK);
    expect(r.text.startsWith("---\r\nt: 1\r\n---\r\n" + START + "\r\n")).toBe(true);
    expect(m.stripBlock(r.text).text).toBe(orig);
  });

  it("strip handles CRLF markers ($ before \\r)", async () => {
    const m = await load();
    const text = `${START}\r\nx\r\n${END}\r\n\r\nrest\r\n`;
    const r = m.stripBlock(text);
    expect(r.status).toBe("stripped");
    expect(r.text).toBe("rest\r\n");
  });

  it("file helpers round-trip a BOM+CRLF file byte-for-byte", async () => {
    const m = await load();
    const f = path.join(dir, "AGENTS.md");
    const orig = `${BOM}# a\r\nb\r\n`;
    await writeFile(f, orig, "utf8");
    await m.injectIntoFile(f, BLOCK);
    const mid = await readFile(f);
    expect(mid.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(mid.subarray(3, 6).toString()).not.toBe("﻿");
    expect((await m.stripFromFile(f)).status).toBe("stripped");
    expect((await readFile(f)).equals(Buffer.from(orig, "utf8"))).toBe(true);
  });

  it("injectBlock rejects an invalid block with E_BLOCK_INVALID", async () => {
    const m = await load();
    expect(() => m.injectBlock("x\n", "no markers here\n")).toThrow(
      expect.objectContaining({ code: "E_BLOCK_INVALID" }),
    );
  });

  it("file helpers refuse non-UTF-8 files with E_NOT_UTF8 and leave them untouched", async () => {
    const m = await load();
    const f = path.join(dir, "bad.md");
    const bytes = Buffer.from([0x61, 0xff, 0xfe, 0x62]);
    await writeFile(f, bytes);
    await expect(m.injectIntoFile(f, BLOCK)).rejects.toMatchObject({ code: "E_NOT_UTF8" });
    expect((await readFile(f)).equals(bytes)).toBe(true);
  });
});

describe("Scenario 3: existing markers are never modified", () => {
  const edited = "<!-- WIKI:START v0 -->\nuser edited\n<!-- WIKI:END -->\n\n# mine\n";

  it("injectBlock returns text unchanged with status skipped", async () => {
    const m = await load();
    const r = m.injectBlock(edited, BLOCK);
    expect(r.status).toBe("skipped");
    expect(r.text).toBe(edited);
  });

  it("injectIntoFile leaves CLAUDE.md byte-identical", async () => {
    const m = await load();
    const f = path.join(dir, "CLAUDE.md");
    await writeFile(f, edited);
    const r = await m.injectIntoFile(f, BLOCK);
    expect(r.status).toBe("skipped");
    expect(await readFile(f, "utf8")).toBe(edited);
  });

  it("marker later in the file also counts as present", async () => {
    const m = await load();
    const t = "# top\n<!-- WIKI:START v2 custom -->\nx\n<!-- WIKI:END -->\n";
    const r = m.injectBlock(t, BLOCK);
    expect(r.status).toBe("skipped");
    expect(r.text).toBe(t);
  });
});

describe("Scenario 4: missing file", () => {
  it("is created with only the block and a trailing newline", async () => {
    const m = await load();
    const f = path.join(dir, "AGENTS.md");
    const r = await m.injectIntoFile(f, BLOCK);
    expect(r.status).toBe("injected");
    expect(r.created).toBe(true);
    expect(await readFile(f, "utf8")).toBe(BLOCK);
  });

  it("stripFromFile on a missing file returns absent and creates nothing", async () => {
    const m = await load();
    const f = path.join(dir, "NOPE.md");
    const r = await m.stripFromFile(f);
    expect(r.status).toBe("absent");
    expect(existsSync(f)).toBe(false);
  });

  it("stripBlock with no START returns absent and the text unchanged", async () => {
    const m = await load();
    const r = m.stripBlock("# nothing\n");
    expect(r.status).toBe("absent");
    expect(r.text).toBe("# nothing\n");
  });

  it("stripping a block-only created file yields an empty string", async () => {
    const m = await load();
    const f = path.join(dir, "AGENTS.md");
    await m.injectIntoFile(f, BLOCK);
    expect((await m.stripFromFile(f)).status).toBe("stripped");
    expect(await readFile(f, "utf8")).toBe("");
  });
});

describe("Scenario 5: strip refuses a block without END marker", () => {
  const broken = "<!-- WIKI:START v1 — managed by wikeeper -->\nno end here\n# mine\n";

  it("stripBlock returns malformed and unchanged text", async () => {
    const m = await load();
    const r = m.stripBlock(broken);
    expect(r.status).toBe("malformed");
    expect(r.text).toBe(broken);
  });

  it("stripFromFile leaves the file byte-identical", async () => {
    const m = await load();
    const f = path.join(dir, "CLAUDE.md");
    await writeFile(f, broken);
    const before = await lstat(f);
    const r = await m.stripFromFile(f);
    expect(r.status).toBe("malformed");
    expect(await readFile(f, "utf8")).toBe(broken);
    expect((await lstat(f)).mtimeMs).toBe(before.mtimeMs);
  });
});

describe("File helpers: symlinks", () => {
  it("writes through a symlink, keeping the link intact", async () => {
    const m = await load();
    const real = path.join(dir, "AGENTS.md");
    const link = path.join(dir, "CLAUDE.md");
    await writeFile(real, "# mine\n");
    try {
      await symlink("AGENTS.md", link);
    } catch {
      return; // symlinks unavailable (e.g. Windows without privilege)
    }
    const r = await m.injectIntoFile(link, BLOCK);
    expect(r.status).toBe("injected");
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
    expect((await readFile(real, "utf8")).startsWith(START)).toBe(true);
  });
});

describe("Placeholder template (R7)", () => {
  it("templates/agent-block.md has both markers, LF endings and a trailing newline", async () => {
    const m = await load();
    const p = path.join(process.cwd(), "templates", "agent-block.md");
    const t = await readFile(p, "utf8");
    expect(t.startsWith(m.WIKI_START_V1)).toBe(true);
    expect(t.trimEnd().endsWith(m.WIKI_END)).toBe(true);
    expect(t.endsWith("\n")).toBe(true);
    expect(t).not.toContain("\r");
  });
});
