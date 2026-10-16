# Sprint Closeout Doc & Metadata Refresh Checklist

> Read at sprint close (Gate 4 ack). Each item names a surface that may need
> updating based on what shipped this sprint. Trigger conditions tell you when
> review is required vs when the surface can be skipped.
>
> Use `node .cleargate/scripts/prep_doc_refresh.mjs <sprint-id>` to generate
> a per-sprint tailored checklist that pre-checks items based on actual
> changed files in the sprint window.

### 1. Project READMEs
| Surface | Trigger condition |
|---|---|
| `README.md` | Any feature shipped that changes user-visible product behavior |
| `cleargate-cli/README.md` | Any change to `cleargate-cli/src/commands/*.ts` |
| `cleargate-planning/README.md` | Any change under `cleargate-planning/` |
| `mcp/README.md` | Any change under `mcp/src/` (note: nested repo; check separately) |
| `admin/README.md` | Any change under `admin/` (currently stub) |

### 2. CHANGELOG files (Common-Changelog format per STORY-016-03)
| Surface | Trigger condition |
|---|---|
| `cleargate-cli/CHANGELOG.md` | Any user-visible change in `cleargate-cli/` (CLI surface, error messages, package contents) |
| `mcp/CHANGELOG.md` | Any user-visible change in `mcp/` (if file exists) |

### 3. Manifest / package metadata
| Surface | Trigger condition |
|---|---|
| `cleargate-planning/MANIFEST.json` | Any change to `.claude/agents/*.md`, `.cleargate/templates/*`, `.cleargate/knowledge/*`, or `.cleargate/scripts/*`. Run `cleargate doctor` to verify scaffold registry. |
| `cleargate-cli/package.json` | Version bump only if releasing this sprint (release lane is separate from sprint close) |
| `mcp/package.json` | Version bump only if releasing this sprint |

### 4. CLAUDE.md "Active state" subsection
| Surface | Trigger condition |
|---|---|
| `CLAUDE.md` lines containing "Active state (as of YYYY-MM-DD)" | Any EPIC / CR / Bug / Hotfix archived this sprint, OR any stack version bumped |
| `cleargate-planning/CLAUDE.md` mirror | Same edit as live (CLEARGATE-tag-block region only — outside-block diverges intentionally) |

### 5. Wiki surfaces (auto-rebuilt by PostToolUse hooks; verify after close)
| Surface | Verify by |
|---|---|
| `.cleargate/wiki/active-sprint.md` | Read top of file; confirm sprint ID, status, and date are current |
| `.cleargate/wiki/index.md` | Read; confirm new artifacts (epics, stories, CRs) appear in the relevant sections |
| `.cleargate/wiki/product-state.md` | Read; confirm shipped capabilities are listed |
| `.cleargate/wiki/roadmap.md` | Read; confirm closed sprint moved from Active to Completed section |

### 6. INDEX surfaces (manual updates)
| Surface | Trigger condition |
|---|---|
| `.cleargate/INDEX.md` | If maintained as a curated roadmap; update when sprint closes |
| `.cleargate/delivery/INDEX.md` | Update epic/sprint map when new artifacts archived |

### 7. Frontmatter version stamps
| Surface | Action |
|---|---|
| Any `.cleargate/templates/*.md` modified this sprint | Run `cleargate stamp <path>` to bump `updated_at_version` |
| `.cleargate/knowledge/cleargate-protocol.md` (post-EPIC-024 slim) | Same |
| `.cleargate/knowledge/cleargate-enforcement.md` (post-EPIC-024 split) | Same |
| Any other `.cleargate/knowledge/*.md` modified | Same |

### 8. Knowledge doc cross-references
| Surface | Action |
|---|---|
| Any knowledge doc that cites `§N` of protocol or enforcement.md | Verify post-rewrite resolution still works (covered for SPRINT-17 specifically by STORY-024-02; revisit if any future § reorganization happens) |

### 9. Mirror parity audit
| Surface | Action |
|---|---|
| `cleargate-planning/.claude/` | `diff -r .claude/agents/ cleargate-planning/.claude/agents/` empty (excluding skills/ flashcards/, hooks/, settings.json which differ intentionally) |
| `cleargate-planning/.cleargate/templates/` | `diff -r .cleargate/templates/ cleargate-planning/.cleargate/templates/` empty |
| `cleargate-planning/.cleargate/knowledge/` | `diff -r .cleargate/knowledge/ cleargate-planning/.cleargate/knowledge/` empty |
