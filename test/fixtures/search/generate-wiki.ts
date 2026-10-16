import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Seeded generator for the STORY-004-02 performance fixture: same seed, byte-identical files (LF only).

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VOCAB = [
  "vendor", "delay", "launch", "budget", "review", "quarterly", "roadmap", "customer", "contract", "risk",
  "owner", "migration", "pricing", "support", "release", "metric", "target", "forecast", "hiring", "audit",
  "security", "latency", "feature", "partner", "invoice", "renewal", "onboarding", "incident", "policy", "scope",
];
const TYPES = ["project", "person", "risk", "decision"];

export interface GeneratedWiki {
  root: string;
  pagesDir: string;
  files: string[];
}

/** Writes `<root>/.wiki/config.yml` and `count` pages under `<root>/.wiki/pages/`. Names are lowercase and unique. */
export async function generateWiki(root: string, opts: { seed?: number; pages?: number } = {}): Promise<GeneratedWiki> {
  const seed = opts.seed ?? 1;
  const count = opts.pages ?? 500;
  const rnd = mulberry32(seed);
  const pick = (): string => VOCAB[Math.floor(rnd() * VOCAB.length)]!;
  const words = (n: number): string => Array.from({ length: n }, pick).join(" ");
  const wikiDir = path.join(root, ".wiki");
  const pagesDir = path.join(wikiDir, "pages");
  await mkdir(pagesDir, { recursive: true });
  await writeFile(path.join(wikiDir, "config.yml"), "agents: [claude]\n");
  const files: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = String(i).padStart(4, "0");
    const rel = `${i % 5 === 0 ? "" : `group${i % 5}/`}page${id}.md`;
    const type = TYPES[i % TYPES.length]!;
    const lines: string[] = [
      "---",
      `type: ${type}`,
      `title: Page ${id} ${pick()}`,
      `aliases: ["alias${id}"]`,
      `sources: ["src-2026-10-16-gen${id}"]`,
      "---",
      `# Page ${id} ${pick()}`,
      `owner:: [[person${String(i % 40).padStart(4, "0")}]]`,
      "",
    ];
    const sections = 5 + Math.floor(rnd() * 6);
    for (let s = 0; s < sections; s++) {
      lines.push(`## ${pick()} ${pick()} ${s}`);
      for (let l = 0; l < 6; l++) lines.push(words(14));
      lines.push(`- 2026-10-${String(10 + (s % 15)).padStart(2, "0")} · decided · ${words(8)}. [[src-2026-10-16-gen${id}]]`);
      lines.push("");
    }
    await mkdir(path.dirname(path.join(pagesDir, ...rel.split("/"))), { recursive: true });
    await writeFile(path.join(pagesDir, ...rel.split("/")), lines.join("\n"));
    files.push(rel);
  }
  return { root, pagesDir, files };
}
