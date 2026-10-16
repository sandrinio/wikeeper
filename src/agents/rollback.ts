import { lstat, mkdir, readdir, readFile, readlink, rm, symlink, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/** Directories that agent wiring (skills, sub-agents, settings, rules) writes into. */
const WATCHED_DIRS = [".claude", ".codex", ".agents"] as const;

type Node = { kind: "file"; bytes: Buffer } | { kind: "link"; target: string } | { kind: "dir" };

function abs(root: string, rel: string): string {
  return path.join(root, ...rel.split("/"));
}

async function statNode(root: string, rel: string): Promise<Node | null> {
  const file = abs(root, rel);
  let st;
  try {
    st = await lstat(file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  if (st.isSymbolicLink()) return { kind: "link", target: await readlink(file) };
  if (st.isDirectory()) return { kind: "dir" };
  return { kind: "file", bytes: await readFile(file) };
}

async function walk(root: string, rel: string, out: Map<string, Node>): Promise<void> {
  const node = await statNode(root, rel);
  if (!node) return;
  out.set(rel, node);
  if (node.kind !== "dir") return;
  for (const name of (await readdir(abs(root, rel))).sort()) await walk(root, `${rel}/${name}`, out);
}

async function removeNode(root: string, rel: string, node: Node): Promise<void> {
  if (node.kind === "dir") await rm(abs(root, rel), { recursive: true, force: true, maxRetries: 3 });
  else await unlink(abs(root, rel)).catch(() => undefined);
}

/**
 * Snapshots every pre-existing file the agents init may touch (`files`, plus everything under the
 * watched agent directories). The returned function restores the snapshot: it rewrites changed files,
 * recreates deleted ones, and deletes every file and directory created since.
 */
export async function snapshotForRollback(root: string, files: readonly string[]): Promise<() => Promise<void>> {
  const before = new Map<string, Node>();
  for (const dir of WATCHED_DIRS) await walk(root, dir, before);
  const extra = new Map<string, Node | null>();
  for (const f of files) extra.set(f, await statNode(root, f));

  return async () => {
    const now = new Map<string, Node>();
    for (const dir of WATCHED_DIRS) await walk(root, dir, now);
    // Created entries (deepest first so children go before parents).
    for (const rel of [...now.keys()].sort((a, b) => b.length - a.length)) {
      if (!before.has(rel)) await removeNode(root, rel, now.get(rel)!);
    }
    for (const [rel, node] of extra) {
      if (node === null) {
        const cur = await statNode(root, rel);
        if (cur) await removeNode(root, rel, cur);
      }
    }
    // Restore changed or deleted entries (shallowest first).
    const restore = new Map<string, Node>(before);
    for (const [rel, node] of extra) if (node !== null) restore.set(rel, node);
    for (const rel of [...restore.keys()].sort((a, b) => a.length - b.length)) {
      const node = restore.get(rel)!;
      const cur = await statNode(root, rel);
      if (node.kind === "dir") {
        if (!cur) await mkdir(abs(root, rel), { recursive: true });
        continue;
      }
      if (node.kind === "file") {
        if (cur?.kind === "file" && cur.bytes.equals(node.bytes)) continue;
        if (cur) await removeNode(root, rel, cur);
        await mkdir(path.dirname(abs(root, rel)), { recursive: true });
        await writeFile(abs(root, rel), node.bytes);
      } else {
        if (cur?.kind === "link" && cur.target === node.target) continue;
        if (cur) await removeNode(root, rel, cur);
        await mkdir(path.dirname(abs(root, rel)), { recursive: true });
        await symlink(node.target, abs(root, rel));
      }
    }
  };
}
