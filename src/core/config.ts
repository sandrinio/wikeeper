import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import path from "node:path";
import YAML from "yaml";
import { ExitCode, WikeeperError } from "./exit-codes.js";
import type { TokenLimits } from "./tokens.js";

export type IngestPermission = "ai" | "ask" | "whitelist";
export type IngestDelegate = "auto" | "never";
export type TokenConfirmAt = "yellow" | "red" | "never";

export interface WikeeperConfig {
  profile: string;
  setup_completed_at: string | null;
  agents: string[];
  content_dir: string;
  private: string[];
  enforce: boolean;
  update_check: boolean;
  ingest: {
    permission: IngestPermission;
    whitelist: { kinds: string[]; origins: string[] };
    ambient_offers: boolean;
    delegate: IngestDelegate;
    extractor_model: string;
    writer_model: string;
  };
  hooks: { pre_ingest: string[]; post_ingest: string[] };
  lint: { stale_after_days: number };
  tokens: { page: TokenLimits; source: TokenLimits & { confirm_at: TokenConfirmAt } };
}
export type WikiConfig = WikeeperConfig;
export interface ConfigIssue {
  key: string;
  value: unknown;
  message: string;
}
export interface LoadConfigResult {
  config: WikeeperConfig;
  warnings: ConfigIssue[];
  errors: ConfigIssue[];
}

type Leaf =
  | { type: "string" | "boolean" | "integer" | "string[]" | "string|null"; default: unknown }
  | { type: "enum"; default: string; allowed: readonly string[] }
  | { type: "content_dir"; default: string }
  | { type: "token-count"; default: number };
type Node = Leaf | { type: "map"; children: Record<string, Node> };

/** One table drives defaults, validation and messages. */
const SCHEMA: Record<string, Node> = {
  profile: { type: "string", default: "management" },
  setup_completed_at: { type: "string|null", default: null },
  agents: { type: "string[]", default: [] },
  content_dir: { type: "content_dir", default: ".wiki" },
  private: { type: "string[]", default: [] },
  enforce: { type: "boolean", default: false },
  update_check: { type: "boolean", default: true },
  ingest: {
    type: "map",
    children: {
      permission: { type: "enum", default: "ask", allowed: ["ai", "ask", "whitelist"] },
      whitelist: {
        type: "map",
        children: {
          kinds: { type: "string[]", default: [] },
          origins: { type: "string[]", default: [] },
        },
      },
      ambient_offers: { type: "boolean", default: true },
      delegate: { type: "enum", default: "auto", allowed: ["auto", "never"] },
      extractor_model: { type: "string", default: "small" },
      writer_model: { type: "string", default: "medium" },
    },
  },
  hooks: {
    type: "map",
    children: {
      pre_ingest: { type: "string[]", default: [] },
      post_ingest: { type: "string[]", default: [] },
    },
  },
  lint: { type: "map", children: { stale_after_days: { type: "integer", default: 30 } } },
  tokens: {
    type: "map",
    children: {
      page: {
        type: "map",
        children: {
          yellow: { type: "token-count", default: 4000 },
          red: { type: "token-count", default: 10000 },
        },
      },
      source: {
        type: "map",
        children: {
          yellow: { type: "token-count", default: 20000 },
          red: { type: "token-count", default: 60000 },
          confirm_at: { type: "enum", default: "yellow", allowed: ["yellow", "red", "never"] },
        },
      },
    },
  },
};

function defaultsOf(children: Record<string, Node>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, n] of Object.entries(children)) {
    out[k] = n.type === "map" ? defaultsOf(n.children) : structuredClone(n.default);
  }
  return out;
}

export const DEFAULT_CONFIG: Readonly<WikeeperConfig> = Object.freeze(defaultsOf(SCHEMA) as unknown as WikeeperConfig);

function configError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

export const CONFIG_SYNTAX_FIX = "fix the YAML syntax in .wiki/config.yml";

/** The one syntax-error message: the parser's first line without its position suffix, then the next step. */
function syntaxError(e: YAML.YAMLError): Error & { code: string } {
  const first = e.message.split("\n")[0]!.replace(/ at line \d+, column \d+:?$/, "");
  const line = e.linePos?.[0]?.line;
  return configError("E_CONFIG_SYNTAX", `config.yml syntax error${line ? ` at line ${line}` : ""}: ${first}: ${CONFIG_SYNTAX_FIX}`);
}

function isMap(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 20000, "20000", "20k", "1.5k" -> a positive whole number; anything else null. */
function parseTokenCount(value: unknown): number | null {
  let n: number;
  if (typeof value === "number") {
    n = value;
  } else if (typeof value === "string") {
    const t = value.trim();
    let m: RegExpExecArray | null;
    if (/^\d+$/.test(t)) n = Number(t);
    else if ((m = /^(\d+)(?:\.(\d{1,3}))?[kK]$/.exec(t))) n = Number(m[1]) * 1000 + Number((m[2] ?? "").padEnd(3, "0"));
    else return null;
  } else {
    return null;
  }
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function normalizeLeaf(node: Leaf, value: unknown): unknown {
  return node.type === "token-count" ? parseTokenCount(value) : value;
}

function validateLeaf(node: Leaf, value: unknown, root: string): string | null {
  switch (node.type) {
    case "string":
      return typeof value === "string" ? null : "must be a string";
    case "string|null":
      return value === null || typeof value === "string" ? null : "must be a string or null";
    case "boolean":
      return typeof value === "boolean" ? null : "must be a boolean";
    case "integer":
      return typeof value === "number" && Number.isInteger(value) && value > 0 ? null : "must be a positive integer";
    case "string[]":
      return Array.isArray(value) && value.every((x) => typeof x === "string") ? null : "must be a list of strings";
    case "enum":
      return typeof value === "string" && node.allowed.includes(value) ? null : `allowed: ${node.allowed.join(", ")}`;
    case "token-count":
      return parseTokenCount(value) === null ? "must be a positive whole number, or a number with k (20000, 20k, 1.5k)" : null;
    case "content_dir": {
      if (typeof value !== "string") return "must be a string";
      const rel = path.relative(root, path.resolve(root, value));
      if (rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel)) return "must stay inside the repository";
      return null;
    }
  }
}

function walk(
  children: Record<string, Node>,
  input: Record<string, unknown>,
  prefix: string,
  root: string,
  warnings: ConfigIssue[],
  errors: ConfigIssue[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(input)) {
    if (!(key in children)) warnings.push({ key: prefix + key, value: input[key], message: "unknown key (ignored)" });
  }
  for (const [k, node] of Object.entries(children)) {
    const keyPath = prefix + k;
    const present = Object.prototype.hasOwnProperty.call(input, k);
    if (node.type === "map") {
      const sub = input[k];
      if (!present || sub === null || sub === undefined) {
        out[k] = defaultsOf(node.children);
      } else if (!isMap(sub)) {
        errors.push({ key: keyPath, value: sub, message: "must be a mapping" });
        out[k] = defaultsOf(node.children);
      } else {
        out[k] = walk(node.children, sub, keyPath + ".", root, warnings, errors);
      }
      continue;
    }
    if (!present) {
      out[k] = structuredClone(node.default);
      continue;
    }
    const problem = validateLeaf(node, input[k], root);
    if (problem) {
      errors.push({ key: keyPath, value: input[k], message: problem });
      out[k] = structuredClone(node.default);
    } else {
      out[k] = normalizeLeaf(node, input[k]);
    }
  }
  return out;
}

function configPath(root: string): string {
  return path.join(root, ".wiki", "config.yml");
}

async function readIfExists(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export function tokenLimitIssues(tokens: WikeeperConfig["tokens"]): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  for (const g of ["page", "source"] as const) {
    const { yellow, red } = tokens[g];
    if (yellow >= red) {
      issues.push({ key: `tokens.${g}.yellow`, value: yellow, message: `must be below tokens.${g}.red (${red})` });
    }
  }
  return issues;
}

export async function loadConfig(root: string): Promise<LoadConfigResult> {
  const warnings: ConfigIssue[] = [];
  const errors: ConfigIssue[] = [];
  const text = await readIfExists(configPath(root));
  if (text === null) return { config: structuredClone(DEFAULT_CONFIG) as WikeeperConfig, warnings, errors };
  const doc = YAML.parseDocument(text.replace(/^\uFEFF/, ""));
  if (doc.errors.length > 0) {
    throw syntaxError(doc.errors[0]!);
  }
  const raw: unknown = doc.toJS();
  if (raw === null || raw === undefined) return { config: structuredClone(DEFAULT_CONFIG) as WikeeperConfig, warnings, errors };
  if (!isMap(raw)) {
    errors.push({ key: "", value: raw, message: "must be a mapping" });
    return { config: structuredClone(DEFAULT_CONFIG) as WikeeperConfig, warnings, errors };
  }
  const config = walk(SCHEMA, raw, "", root, warnings, errors) as unknown as WikeeperConfig;
  const bad = (k: string): boolean => errors.some((e) => e.key === k);
  const limitIssues = tokenLimitIssues(config.tokens).filter((i) => {
    const g = i.key.split(".")[1]!;
    return !(bad("tokens") || bad(`tokens.${g}`) || bad(`tokens.${g}.yellow`) || bad(`tokens.${g}.red`));
  });
  errors.push(...limitIssues);
  return { config, warnings, errors };
}

/** True when `.wiki/config.yml` itself sets the dotted key (loadConfig fills defaults and cannot tell). */
export async function configKeyIsSet(root: string, keyPath: string): Promise<boolean> {
  let text: string | null;
  try {
    text = await readIfExists(configPath(root));
  } catch {
    return false;
  }
  if (text === null) return false;
  const doc = YAML.parseDocument(text.replace(/^\uFEFF/, ""));
  if (doc.errors.length > 0) return false;
  return doc.hasIn(keyPath.split("."));
}

export function formatConfigIssue(issue: ConfigIssue): string {
  return `${issue.key}: ${JSON.stringify(issue.value)} — ${issue.message}`;
}

export function getConfigLeaf(keyPath: string): { type: string; default: unknown; allowed?: readonly string[] } | null {
  const node = nodeAt(keyPath);
  if (node === null || node.type === "map") return null;
  return {
    type: node.type,
    default: structuredClone(node.default),
    ...(node.type === "enum" ? { allowed: node.allowed } : {}),
  };
}

function nodeAt(keyPath: string): Node | null {
  let children: Record<string, Node> = SCHEMA;
  let node: Node | null = null;
  for (const seg of keyPath.split(".")) {
    if (!Object.prototype.hasOwnProperty.call(children, seg)) return null;
    node = children[seg]!;
    if (node.type === "map") children = node.children;
    else children = {};
  }
  return node;
}

/** Leaf keys under `prefix` (or all), in SCHEMA order; a leaf prefix returns [prefix]; unknown gives []. */
export function configLeafKeys(prefix?: string): string[] {
  const out: string[] = [];
  const visit = (children: Record<string, Node>, pre: string): void => {
    for (const [k, n] of Object.entries(children)) {
      if (n.type === "map") visit(n.children, pre + k + ".");
      else out.push(pre + k);
    }
  };
  if (prefix === undefined) {
    visit(SCHEMA, "");
    return out;
  }
  const node = nodeAt(prefix);
  if (node === null) return [];
  if (node.type !== "map") return [prefix];
  visit(node.children, prefix + ".");
  return out;
}

function isGroup(keyPath: string): boolean {
  return nodeAt(keyPath)?.type === "map";
}

export function checkConfigKey(keyPath: string, use: "get" | "set"): void {
  const node = nodeAt(keyPath);
  if (node === null) {
    const segs = keyPath.split(".");
    let parent: string | null = null;
    for (let n = segs.length - 1; n >= 1; n--) {
      const pre = segs.slice(0, n).join(".");
      if (isGroup(pre)) {
        parent = pre;
        break;
      }
    }
    const known = configLeafKeys(parent ?? undefined);
    const where = parent === null ? "known keys" : `keys under ${parent}`;
    throw new WikeeperError(
      ExitCode.USAGE,
      "invalid_config_key",
      `unknown config key "${keyPath}"; ${where}: ${known.join(", ")}`,
      { key: keyPath, known },
    );
  }
  if (use === "get") return;
  if (node.type === "map") {
    const known = configLeafKeys(keyPath);
    throw new WikeeperError(
      ExitCode.USAGE,
      "invalid_config_key",
      `${keyPath} is a group of settings; keys under ${keyPath}: ${known.join(", ")}`,
      { key: keyPath, known },
    );
  }
  if (node.type === "string[]") {
    const extra = keyPath === "agents" ? ", or run wikeeper init --agents <list>" : "";
    throw new WikeeperError(
      ExitCode.USAGE,
      "config_key_not_settable",
      `${keyPath} is a list setting: edit .wiki/config.yml by hand${extra}`,
      { key: keyPath },
    );
  }
  if (node.type === "content_dir") {
    throw new WikeeperError(
      ExitCode.USAGE,
      "config_key_not_settable",
      "content_dir is not changed with config set: move pages/, archive/, raw/, log/ and index.md to the new folder, edit content_dir in .wiki/config.yml, then run wikeeper update",
      { key: keyPath },
    );
  }
}

export function parseConfigValue(keyPath: string, raw: string): unknown {
  checkConfigKey(keyPath, "set");
  const node = nodeAt(keyPath) as Leaf;
  const refuse = (message: string): never => {
    throw new WikeeperError(
      ExitCode.USAGE,
      "invalid_config_value",
      formatConfigIssue({ key: keyPath, value: raw, message }),
      { key: keyPath, value: raw, message },
    );
  };
  let value: unknown = raw;
  switch (node.type) {
    case "string":
    case "enum":
      break;
    case "string|null":
      if (raw === "null") value = null;
      break;
    case "boolean":
      if (/^true$/i.test(raw)) value = true;
      else if (/^false$/i.test(raw)) value = false;
      break;
    case "integer":
      if (/^\d+$/.test(raw)) value = Number(raw);
      break;
    case "token-count":
      if (/^\d+$/.test(raw)) value = Number(raw);
      break;
    default:
      break;
  }
  const problem = validateLeaf(node, value, "");
  if (problem) refuse(problem);
  return normalizeLeaf(node, value);
}

/** The shared read-edit-write path: keeps BOM, CRLF, comments and key order; writes only when `edit` returns true. */
async function editConfig(root: string, edit: (doc: YAML.Document.Parsed) => boolean): Promise<boolean> {
  const file = configPath(root);
  const existing = await readIfExists(file);
  const bom = existing?.startsWith("\uFEFF") ?? false;
  const body = bom ? existing!.slice(1) : (existing ?? "");
  const crlf = /\r\n/.test(body) && body.indexOf("\r\n") <= body.indexOf("\n");
  const doc = YAML.parseDocument(body);
  if (doc.errors.length > 0) throw syntaxError(doc.errors[0]!);
  if (!edit(doc)) return false;
  let out = doc.toString({ lineWidth: 0 });
  if (crlf) out = out.replace(/\r?\n/g, "\r\n");
  if (bom) out = "\uFEFF" + out;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, out);
  return true;
}

/** Sets one dotted key via the Document API (comments and key order survive). Returns true when the file was written. */
export async function setConfigValue(root: string, keyPath: string, value: unknown): Promise<boolean> {
  const keys = keyPath.split(".");
  return editConfig(root, (doc) => {
    const current = doc.getIn(keys);
    const plain = YAML.isNode(current) ? current.toJSON() : current;
    if (plain !== undefined && isDeepStrictEqual(plain, value)) return false;
    for (let i = 1; i < keys.length; i++) {
      const prefix = keys.slice(0, i);
      const n = doc.getIn(prefix, true);
      if (YAML.isScalar(n) && n.value === null) {
        if (doc.contents === null || doc.contents === undefined) break;
        doc.setIn(prefix, new YAML.YAMLMap(doc.schema));
      } else if (n !== undefined && !YAML.isMap(n)) {
        throw configError("config_invalid", `${prefix.join(".")} must be a mapping in .wiki/config.yml: fix it by hand`);
      }
    }
    if (doc.contents === null || doc.contents === undefined) {
      doc.contents = new YAML.YAMLMap(doc.schema) as unknown as typeof doc.contents;
    }
    doc.setIn(keys, value);
    return true;
  });
}

/** Removes one dotted key, then the groups it leaves empty. False (and no write) when the file does not set it. */
export async function unsetConfigValue(root: string, keyPath: string): Promise<boolean> {
  const keys = keyPath.split(".");
  return editConfig(root, (doc) => {
    if (!doc.hasIn(keys)) return false;
    doc.deleteIn(keys);
    for (let i = keys.length - 1; i >= 1; i--) {
      const n = doc.getIn(keys.slice(0, i), true);
      if (YAML.isMap(n) && n.items.length === 0) doc.deleteIn(keys.slice(0, i));
      else break;
    }
    return true;
  });
}
