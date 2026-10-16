// Contract C1 — contract/S-02-page-parser (owner STORY-004-01). Frozen exports: the owner replaces the bodies
// and never renames or retypes an export. Consumers: STORY-003-07, 003-09, 004-02…004-06, 006-03, 006-04.

function stub(name: string): never {
  throw new Error(`contract stub: ${name} (C1)`);
}

export const CITATION_RE: RegExp = /^src-\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface PageFrontmatter {
  type: string | null;
  title: string | null;
  summary: string | null;
  aliases: string[];
  sources: string[];
  updated: string | null;
  data: Record<string, unknown>;
}
export interface PageSection {
  index: number;
  heading: string;
  level: number;
  line: number;
  endLine: number;
  parent: number | null;
  entity: boolean;
  text: string;
}
export interface TypedLink {
  key: string;
  value: string;
  targets: string[];
  line: number;
  section: number;
}
export type FactStatus = "decided" | "tentative";
export interface Fact {
  date: string;
  status: FactStatus;
  text: string;
  sources: string[];
  contradicts: string[];
  contradiction: boolean;
  line: number;
  section: number;
}
export interface WikiLink {
  target: string;
  line: number;
  section: number;
}
export interface PageError {
  line: number | null;
  code: "frontmatter_yaml" | "frontmatter_field" | "fact_status" | "fact_date";
  message: string;
}
export interface Page {
  path: string;
  title: string;
  frontmatter: PageFrontmatter;
  sections: PageSection[];
  typedLinks: TypedLink[];
  facts: Fact[];
  links: WikiLink[];
  wikilinks: string[];
  citations: string[];
  errors: PageError[];
}
export interface Entity {
  key: string;
  kind: "page" | "section";
  name: string;
  type: string | null;
  aliases: string[];
  path: string;
  section: number;
  line: number;
  summary: string | null;
  typedLinks: TypedLink[];
  facts: Fact[];
}
export interface Backlink {
  path: string;
  section: number;
  heading: string;
  line: number;
  context: string;
}

export function parsePage(text: string, relPath: string): Page {
  return stub("parsePage");
}
export function pageEntities(page: Page): Entity[] {
  return stub("pageEntities");
}
export function owningEntityKey(page: Page, section: number): string {
  return stub("owningEntityKey");
}
export function linkTarget(raw: string): string {
  return stub("linkTarget");
}
export function normalizeName(name: string): string {
  return stub("normalizeName");
}
export async function listPageFiles(pagesDir: string): Promise<string[]> {
  return stub("listPageFiles");
}
export async function loadPages(pagesDir: string): Promise<Page[]> {
  return stub("loadPages");
}
export function buildBacklinks(pages: readonly Page[]): Map<string, Backlink[]> {
  return stub("buildBacklinks");
}
