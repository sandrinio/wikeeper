import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import path from "node:path";
import YAML from "yaml";
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
  | { type: "content_dir"; default: string };
type Node = Leaf | { type: "map"; children: Record<string, Node> };

/** One table drives defaults, validation and messages. */
const SCHEMA: Record<string, Node> = {
  profile: { type: "string", default: "management" },
  setup_completed_at: { type: "string|null", default: null },
  agents: { type: "string[]", default: [] },
  content_dir: { type: "content_dir", default: ".wiki" },
  private: { type: "string[]", default: [] },
  enforce: { type: "boolean", default: false },
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

function isMap(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
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
      out[k] = input[k];
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

export function tokenLimitIssues(_tokens: WikeeperConfig["tokens"]): ConfigIssue[] {
  throw new Error("contract stub C1");
}

export async function loadConfig(root: string): Promise<LoadConfigResult> {
  const warnings: ConfigIssue[] = [];
  const errors: ConfigIssue[] = [];
  const text = await readIfExists(configPath(root));
  if (text === null) return { config: structuredClone(DEFAULT_CONFIG) as WikeeperConfig, warnings, errors };
  const doc = YAML.parseDocument(text.replace(/^\uFEFF/, ""));
  if (doc.errors.length > 0) {
    const e = doc.errors[0]!;
    const line = e.linePos?.[0]?.line;
    throw configError("E_CONFIG_SYNTAX", `config.yml syntax error${line ? ` at line ${line}` : ""}: ${e.message}`);
  }
  const raw: unknown = doc.toJS();
  if (raw === null || raw === undefined) return { config: structuredClone(DEFAULT_CONFIG) as WikeeperConfig, warnings, errors };
  if (!isMap(raw)) {
    errors.push({ key: "", value: raw, message: "must be a mapping" });
    return { config: structuredClone(DEFAULT_CONFIG) as WikeeperConfig, warnings, errors };
  }
  const config = walk(SCHEMA, raw, "", root, warnings, errors) as unknown as WikeeperConfig;
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

/** Sets one dotted key via the Document API (comments and key order survive). Returns true when the file was written. */
export async function setConfigValue(root: string, keyPath: string, value: unknown): Promise<boolean> {
  const file = configPath(root);
  const existing = await readIfExists(file);
  const bom = existing?.startsWith("\uFEFF") ?? false;
  const body = bom ? existing!.slice(1) : (existing ?? "");
  const crlf = /\r\n/.test(body) && body.indexOf("\r\n") <= body.indexOf("\n");
  const doc = YAML.parseDocument(body);
  if (doc.errors.length > 0) {
    const line = doc.errors[0]!.linePos?.[0]?.line;
    throw configError("E_CONFIG_SYNTAX", `config.yml syntax error${line ? ` at line ${line}` : ""}: ${doc.errors[0]!.message}`);
  }
  const keys = keyPath.split(".");
  if (existing !== null) {
    const current = doc.getIn(keys);
    const plain = YAML.isNode(current) ? current.toJSON() : current;
    if (plain !== undefined && isDeepStrictEqual(plain, value)) return false;
  }
  if (doc.contents === null || doc.contents === undefined) doc.contents = new YAML.YAMLMap() as unknown as typeof doc.contents;
  doc.setIn(keys, value);
  let out = doc.toString({ lineWidth: 0 });
  if (crlf) out = out.replace(/\r?\n/g, "\r\n");
  if (bom) out = "\uFEFF" + out;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, out);
  return true;
}
