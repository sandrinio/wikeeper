// src/kb/parse-instructions.ts
// Contract C1 — contract/S-03-kb-parser (owner STORY-005-01). Frozen exports: the owner replaces the two function
// bodies and never renames or retypes an export; the three lists keep exactly these values, in this order.
// Consumers: STORY-005-02, 005-04, 005-05, 005-06, 006-10, 006-11.
import { readFile } from "node:fs/promises";
import { compareCodeUnits } from "../core/compare.js";
import type { ResolvedPaths } from "../core/paths.js";
import { parseSourceKinds, type SourceKindRule } from "../ingest/kind-rules.js";

/** The `## ` section keys, in STORY-005-01 R3 order. */
export const KB_SECTION_KEYS = [
  "questions",
  "entities",
  "capture-signals",
  "source-kinds",
  "write-policy",
  "never-capture",
  "rule-changelog",
] as const;
export type KbSectionKey = (typeof KB_SECTION_KEYS)[number];

/** The sections a rule proposal names instead of a source kind (`wikeeper rules record --kind`, STORY-005-06). */
export const KB_PROPOSAL_SECTION_KEYS = [
  "questions",
  "entities",
  "capture-signals",
  "write-policy",
  "never-capture",
] as const;

export const KB_ISSUE_CODES = [
  "unknown-question-ref",
  "malformed-question",
  "malformed-entity",
  "ambiguous-line",
  "missing-section",
] as const;

export interface KbSection {
  heading: string;
  key: KbSectionKey | null;
  line: number;
}
export interface KbQuestion {
  id: string; // "Q4"
  text: string;
  datedFacts: boolean;
  line: number;
}
export interface KbEntity {
  name: string;
  fields: string[];
  page: string;
  questionRefs: string[];
  line: number;
}
export interface KbNote {
  section: string; // a KbSectionKey, or "" before the first heading or under an unknown heading
  text: string;
  line: number;
}
export interface KbChangelogEntry {
  date: string; // YYYY-MM-DD
  text: string;
  line: number;
}
export interface KbIssue {
  line: number; // 0 = whole file
  code: string; // one of KB_ISSUE_CODES
  message: string;
}
export interface KbInstructions {
  purpose: string | null;
  sections: KbSection[];
  questions: KbQuestion[];
  entities: KbEntity[];
  kinds: SourceKindRule[]; // exactly parseSourceKinds(text) (SPRINT-02 C2)
  notes: KbNote[];
  neverCapture: string[];
  changelog: KbChangelogEntry[];
  issues: KbIssue[]; // sorted by line, then code
}

const HEADING_KEYS: Array<[RegExp, KbSectionKey]> = [
  [/^questions\b/i, "questions"],
  [/^entities\b/i, "entities"],
  [/^capture\s+signals\b/i, "capture-signals"],
  [/^source\s+kinds\b/i, "source-kinds"],
  [/^write\s+policy\b/i, "write-policy"],
  [/^never\s+capture\b/i, "never-capture"],
  [/^rule\s+changelog\b/i, "rule-changelog"],
];

const QUESTION_RE = /^\s*(?:[-*]\s+)?Q(\d+)(?:[.:]\s*|\s+)(\S.*?)\s*$/i;
const MALFORMED_QUESTION_RE = /^\s*(?:[-*]\s+)?Q(\d+)\b/i;
const ENTITY_RE = /^\s*(?:[-*]\s+)?([A-Za-z][A-Za-z0-9_-]*)(?:\s+(.*?))?\s*(?:→|->)\s*(\S+)?\s*(.*)$/;
const NOTE_RE = /^\s*(?:[-*]\s+)?note:\s*(.*)$/i;
const CHANGELOG_RE = /^\s*(?:[-*]\s+)?(\d{4}-\d{2}-\d{2})\s*:?\s+(\S.*?)\s*$/;
const NEVER_RE = /^\s*[-*]\s+(\S.*?)\s*$/;
const PURPOSE_RE = /^purpose:\s*(\S.*?)\s*$/i;
const FENCE_RE = /^\s*(```+|~~~+)/;

const ENTITY_FORM = "<entity> <fields> → <page> <Q refs>";

function qid(digits: string): string {
  return "Q" + digits.replace(/^0+(?=\d)/, "");
}

function hasArrow(line: string): boolean {
  const bare = line.replace(/`[^`]*`/g, "");
  return bare.includes("→") || bare.includes("->");
}

export function parseInstructions(text: string): KbInstructions {
  const kinds = parseSourceKinds(text);
  const kindLines = new Set(kinds.map((k) => k.line));
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);

  const sections: KbSection[] = [];
  const questions: KbQuestion[] = [];
  const entities: KbEntity[] = [];
  const notes: KbNote[] = [];
  const neverCapture: string[] = [];
  const changelog: KbChangelogEntry[] = [];
  const issues: KbIssue[] = [];
  const commented = new Set<number>();
  let purpose: string | null = null;

  let fence: string | null = null;
  let inComment = false;
  let current: KbSection | null = null;

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const raw = lines[i] ?? "";
    const fenceMatch = FENCE_RE.exec(raw);
    if (fenceMatch) {
      const marker = (fenceMatch[1] ?? "").charAt(0);
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence !== null) continue;

    let line = raw;
    if (inComment) {
      commented.add(lineNo);
      const end = line.indexOf("-->");
      if (end < 0) continue;
      line = line.slice(end + 3);
      inComment = false;
    }
    line = line.replace(/<!--[\s\S]*?-->/g, "");
    const open = line.indexOf("<!--");
    if (open >= 0) {
      line = line.slice(0, open);
      inComment = true;
    }
    if (line.trim() === "") continue;

    if (/^##\s/.test(line)) {
      const heading = line.replace(/^##\s+/, "").trim();
      const key = HEADING_KEYS.find(([re]) => re.test(heading))?.[1] ?? null;
      current = { heading, key, line: lineNo };
      sections.push(current);
      continue;
    }
    if (/^#{1}\s|^#{3,}\s/.test(line)) continue;

    if (current === null && purpose === null) {
      const p = PURPOSE_RE.exec(line.trim());
      if (p) {
        purpose = p[1] ?? null;
        continue;
      }
    }

    const sectionName = current?.key ?? "";
    const addNote = (t: string) => notes.push({ section: sectionName, text: t, line: lineNo });
    const noteMatch = NOTE_RE.exec(line);
    if (noteMatch) {
      addNote((noteMatch[1] ?? "").trim());
      continue;
    }
    const ambiguous = () =>
      issues.push({
        line: lineNo,
        code: "ambiguous-line",
        message: 'prose line with an arrow; write it as a rule or start it with "note:"',
      });

    switch (current?.key) {
      case "questions": {
        const q = QUESTION_RE.exec(line);
        if (q) {
          let t = (q[2] ?? "").trim();
          const dated = /\s*\(dated facts\)$/i.test(t);
          if (dated) t = t.replace(/\s*\(dated facts\)$/i, "").trim();
          if (t === "") {
            issues.push({ line: lineNo, code: "malformed-question", message: `${qid(q[1] ?? "")} has no question text` });
          } else {
            questions.push({ id: qid(q[1] ?? ""), text: t, datedFacts: dated, line: lineNo });
          }
          break;
        }
        const bad = MALFORMED_QUESTION_RE.exec(line);
        if (bad) {
          issues.push({ line: lineNo, code: "malformed-question", message: `${qid(bad[1] ?? "")} has no question text` });
        } else if (hasArrow(line)) ambiguous();
        else addNote(line.trim());
        break;
      }
      case "entities": {
        if (!hasArrow(line)) {
          addNote(line.trim());
          break;
        }
        const m = ENTITY_RE.exec(line);
        const page = m?.[3];
        const refWords = (m?.[4] ?? "").split(/[\s,]+/).filter((w) => w !== "");
        if (!m || !page || !refWords.every((w) => /^Q\d+$/i.test(w))) {
          issues.push({
            line: lineNo,
            code: "malformed-entity",
            message: `not an entity line: expected "${ENTITY_FORM}"`,
          });
          break;
        }
        entities.push({
          name: (m[1] ?? "").toLowerCase(),
          fields: (m[2] ?? "")
            .split(",")
            .map((f) => f.trim())
            .filter((f) => f !== ""),
          page,
          questionRefs: refWords.map((w) => qid(w.slice(1))),
          line: lineNo,
        });
        break;
      }
      case "source-kinds": {
        if (kindLines.has(lineNo)) break;
        if (hasArrow(line)) ambiguous();
        else addNote(line.trim());
        break;
      }
      case "never-capture": {
        const n = NEVER_RE.exec(line);
        if (n) neverCapture.push(n[1] ?? "");
        break;
      }
      case "rule-changelog": {
        const c = CHANGELOG_RE.exec(line);
        if (c) changelog.push({ date: c[1] ?? "", text: c[2] ?? "", line: lineNo });
        break;
      }
      default:
        break;
    }
  }

  const known = new Set(questions.map((q) => q.id));
  for (const e of entities) {
    for (const ref of e.questionRefs) {
      if (!known.has(ref)) {
        issues.push({
          line: e.line,
          code: "unknown-question-ref",
          message: `entity "${e.name}" refers to ${ref}, which is not a question in this file`,
        });
      }
    }
  }
  for (const k of kinds) {
    if (commented.has(k.line)) {
      issues.push({
        line: k.line,
        code: "ambiguous-line",
        message:
          "inside an HTML comment, but ingest still reads it as a source-kind rule; delete it or put it in a code fence",
      });
    }
  }
  const required: Array<[KbSectionKey, string]> = [
    ["questions", "## Questions"],
    ["entities", "## Entities"],
    ["source-kinds", "## Source kinds"],
  ];
  for (const [key, heading] of required) {
    if (!sections.some((s) => s.key === key)) {
      issues.push({ line: 0, code: "missing-section", message: `no "${heading}" section; add it` });
    }
  }
  issues.sort((a, b) => a.line - b.line || compareCodeUnits(a.code, b.code));

  return { purpose, sections, questions, entities, kinds, notes, neverCapture, changelog, issues };
}

export async function loadInstructions(paths: ResolvedPaths): Promise<{ text: string; kb: KbInstructions } | null> {
  let text: string;
  try {
    text = await readFile(paths.kbInstructions, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return null;
    throw err;
  }
  return { text, kb: parseInstructions(text) };
}
