import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const tmpDirs: string[] = [];
async function tmp(): Promise<string> {
  const d = await mkdtemp(path.join(os.tmpdir(), "wk-man-"));
  tmpDirs.push(d);
  return d;
}
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});

const load = () => import("../src/core/manifest.js");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const CONTENTS: Record<string, string> = {
  ".wiki/system/WIKI.md": "wiki\n",
  ".wiki/system/SETUP.md": "setup\n",
  ".wiki/system/profiles/management.md": "mgmt\n",
};

async function seed(root: string): Promise<void> {
  for (const [rel, text] of Object.entries(CONTENTS)) {
    const abs = path.join(root, ...rel.split("/"));
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, text);
  }
}

describe("manifest: round trip (Gherkin: The manifest round-trips deterministically)", () => {
  it("sorts entries by posix path, keeps sha256 and kind, reads back", async () => {
    const { writeManifest, readManifest } = await load();
    const root = await tmp();
    const file = path.join(root, ".wiki", "system", "manifest.json");
    const files = [".wiki/system/WIKI.md", ".wiki/system/profiles/management.md", ".wiki/system/SETUP.md"].map(
      (p) => ({ path: p, sha256: sha(CONTENTS[p]!), kind: "system" as const }),
    );
    const wrote = await writeManifest({ package_version: "1.2.3", files }, file);
    expect(wrote).toBe(true);
    const back = await readManifest(file);
    expect(back).not.toBeNull();
    expect(back!.package_version).toBe("1.2.3");
    expect(back!.files.map((f) => f.path)).toEqual([
      ".wiki/system/SETUP.md",
      ".wiki/system/WIKI.md",
      ".wiki/system/profiles/management.md",
    ]);
    for (const f of back!.files) {
      expect(f.sha256).toBe(sha(CONTENTS[f.path]!));
      expect(f.kind).toBe("system");
    }
  });

  it("writes stable JSON: 2-space indent, trailing newline, no timestamps", async () => {
    const { serializeManifest } = await load();
    const text = serializeManifest({
      package_version: "0.0.1",
      files: [
        { path: "b", sha256: sha("b"), kind: "system" },
        { path: "a", sha256: sha("a"), kind: "system" },
      ],
    });
    expect(text.endsWith("}\n")).toBe(true);
    expect(text.startsWith('{\n  "package_version": "0.0.1",\n  "files": [\n    {\n      "path": "a",')).toBe(true);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(text).not.toContain("\r");
    const parsed = JSON.parse(text);
    expect(Object.keys(parsed)).toEqual(["package_version", "files"]);
    expect(Object.keys(parsed.files[0])).toEqual(["path", "sha256", "kind"]);
  });

  it("serializeManifest does not mutate its input and orders keys canonically", async () => {
    const { serializeManifest } = await load();
    const input = {
      package_version: "1",
      files: [
        { kind: "hook" as const, path: "z", sha256: null, identity: "i", created: true, agent: "claude" },
        { kind: "system" as const, path: "a", sha256: sha("a") },
      ],
    };
    const snapshot = JSON.stringify(input);
    const parsed = JSON.parse(serializeManifest(input));
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(parsed.files[1]).toEqual({ path: "z", sha256: null, kind: "hook", agent: "claude", created: true, identity: "i" });
    expect(Object.keys(parsed.files[1])).toEqual(["path", "sha256", "kind", "agent", "created", "identity"]);
  });

  it("writing the same manifest twice produces identical bytes and skips the second write", async () => {
    const { writeManifest } = await load();
    const root = await tmp();
    const file = path.join(root, "m", "manifest.json");
    const m = {
      package_version: "1.0.0",
      files: [
        { path: "b.md", sha256: sha("b"), kind: "system" as const },
        { path: "a.md", sha256: sha("a"), kind: "system" as const },
      ],
    };
    expect(await writeManifest(m, file)).toBe(true);
    const first = await readFile(file);
    const shuffled = { ...m, files: [...m.files].reverse() };
    expect(await writeManifest(shuffled, file)).toBe(false);
    expect(Buffer.compare(first, await readFile(file))).toBe(0);
  });

  it("readManifest returns null when the file is absent", async () => {
    const { readManifest } = await load();
    const root = await tmp();
    expect(await readManifest(path.join(root, "nope", "manifest.json"))).toBeNull();
  });

  it("sha256File hashes bytes on disk", async () => {
    const { sha256File } = await load();
    const root = await tmp();
    const p = path.join(root, "f.bin");
    const bytes = Buffer.from([0, 1, 2, 0xff, 0x0d, 0x0a]);
    await writeFile(p, bytes);
    expect(await sha256File(p)).toBe(createHash("sha256").update(bytes).digest("hex"));
  });
});

describe("manifest: drift (Gherkin: Drift is classified per file)", () => {
  it("classifies ok, modified and missing", async () => {
    const { diffManifest } = await load();
    const root = await tmp();
    await seed(root);
    const manifest = {
      package_version: "1.0.0",
      files: Object.entries(CONTENTS).map(([p, t]) => ({ path: p, sha256: sha(t), kind: "system" as const })),
    };
    await writeFile(path.join(root, ".wiki", "system", "SETUP.md"), "edited\n");
    await rm(path.join(root, ".wiki", "system", "profiles", "management.md"));
    const diff = await diffManifest(manifest, root);
    const byPath = Object.fromEntries(diff.map((d) => [d.path, d.status]));
    expect(byPath[".wiki/system/WIKI.md"]).toBe("ok");
    expect(byPath[".wiki/system/SETUP.md"]).toBe("modified");
    expect(byPath[".wiki/system/profiles/management.md"]).toBe("missing");
    expect(diff.map((d) => d.path)).toEqual(manifest.files.map((f) => f.path));
    expect(diff[0]).toMatchObject({ kind: "system", sha256: manifest.files[0]!.sha256 });
  });

  it("treats a hashed entry that is now a directory as modified", async () => {
    const { diffManifest } = await load();
    const root = await tmp();
    await mkdir(path.join(root, "d"), { recursive: true });
    const [r] = await diffManifest(
      { package_version: "1", files: [{ path: "d", sha256: sha("x"), kind: "system" }] },
      root,
    );
    expect(r!.status).toBe("modified");
  });

  it("sha256:null entries are ok when present (including directories), missing otherwise", async () => {
    const { diffManifest } = await load();
    const root = await tmp();
    await mkdir(path.join(root, "dir"), { recursive: true });
    await writeFile(path.join(root, "AGENTS.md"), "x");
    const diff = await diffManifest(
      {
        package_version: "1",
        files: [
          { path: "dir", sha256: null, kind: "dir" },
          { path: "AGENTS.md", sha256: null, kind: "block" },
          { path: "gone.md", sha256: null, kind: "block" },
        ],
      },
      root,
    );
    expect(diff.map((d) => d.status)).toEqual(["ok", "ok", "missing"]);
  });

  it("counts a dangling symlink with sha256:null as present", async () => {
    const { diffManifest } = await load();
    const root = await tmp();
    try {
      await symlink(path.join(root, "nowhere"), path.join(root, "link"));
    } catch {
      return; // symlinks unavailable (Windows without privilege)
    }
    const [r] = await diffManifest(
      { package_version: "1", files: [{ path: "link", sha256: null, kind: "link" }] },
      root,
    );
    expect(r!.status).toBe("ok");
  });
});

describe("manifest: errors (Gherkin: unreadable inputs are reported with a code)", () => {
  it("malformed JSON throws E_MANIFEST_INVALID", async () => {
    const { readManifest } = await load();
    const root = await tmp();
    const p = path.join(root, "manifest.json");
    await writeFile(p, "{oops");
    await expect(readManifest(p)).rejects.toMatchObject({ code: "E_MANIFEST_INVALID" });
  });

  const badShapes: Array<[string, unknown]> = [
    ["package_version not a string", { package_version: 1, files: [] }],
    ["files not an array", { package_version: "1", files: {} }],
    ["entry path not a string", { package_version: "1", files: [{ path: 3, sha256: null, kind: "system" }] }],
    ["sha256 not hex", { package_version: "1", files: [{ path: "a", sha256: "xyz", kind: "system" }] }],
    ["sha256 wrong length", { package_version: "1", files: [{ path: "a", sha256: "ab", kind: "system" }] }],
    ["unknown kind", { package_version: "1", files: [{ path: "a", sha256: null, kind: "bogus" }] }],
    ["root not an object", [1, 2]],
  ];
  for (const [label, body] of badShapes) {
    it(`bad shape (${label}) throws E_MANIFEST_INVALID`, async () => {
      const { readManifest } = await load();
      const root = await tmp();
      const p = path.join(root, "manifest.json");
      await writeFile(p, JSON.stringify(body));
      await expect(readManifest(p)).rejects.toMatchObject({ code: "E_MANIFEST_INVALID" });
    });
  }

  it("drops unknown extra keys on read", async () => {
    const { readManifest } = await load();
    const root = await tmp();
    const p = path.join(root, "manifest.json");
    await writeFile(
      p,
      JSON.stringify({
        package_version: "1",
        extra: true,
        files: [{ path: "a", sha256: sha("a"), kind: "system", surprise: 1 }],
      }),
    );
    const m = await readManifest(p);
    expect(m).toEqual({ package_version: "1", files: [{ path: "a", sha256: sha("a"), kind: "system" }] });
  });
});
