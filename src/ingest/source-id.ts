// Contract C3 — owner STORY-003-01. Source ids: src-YYYY-MM-DD-<slug>.

export const SOURCE_ID_PATTERN: RegExp = /^src-\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

const MAX_SLUG = 40;

export function isSourceId(value: string): boolean {
  return SOURCE_ID_PATTERN.test(value);
}

export function slugify(label: string): string {
  const base = label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (base === "") return "source";
  if (base.length <= MAX_SLUG) return base;
  const cut = base.slice(0, MAX_SLUG);
  // Prefer a '-' boundary: only when the character after the cut is '-' the cut is already clean.
  const boundary = base[MAX_SLUG] === "-" ? MAX_SLUG : cut.lastIndexOf("-");
  const out = boundary > 0 ? base.slice(0, boundary) : cut;
  return out.replace(/-+$/g, "");
}

/** UTC calendar date as "YYYY-MM-DD". */
export function formatIdDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function makeSourceId(date: Date, label: string, taken: (id: string) => boolean): string {
  const base = `src-${formatIdDate(date)}-${slugify(label)}`;
  if (!taken(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken(candidate)) return candidate;
  }
}
