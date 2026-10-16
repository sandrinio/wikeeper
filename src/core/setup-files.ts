import { readFile } from "node:fs/promises";
import path from "node:path";
import type { WikeeperConfig } from "./config.js";
import { createGit } from "./git.js";
import type { Git, IgnoreRule } from "./git.js";
import { stripManagedBlock } from "./gitignore.js";
import type { DoctorCheck } from "./integrations.js";
import { toPosixRelative } from "./paths.js";
import type { ResolvedPaths } from "./paths.js";

export const SETUP_FILES_CHECK_ID = "setup-files";

async function exists(file: string): Promise<boolean> {
  try {
    await readFile(file);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return false;
    if (code === "EISDIR") return true;
    throw err;
  }
}

const ruleText = (r: IgnoreRule): string => `${r.source}:${r.line} ${r.pattern}`;

export async function checkSetupFiles(
  root: string,
  paths: ResolvedPaths,
  config: Pick<WikeeperConfig, "setup_completed_at">,
  git: Git = createGit(root),
): Promise<DoctorCheck[]> {
  const id = SETUP_FILES_CHECK_ID;
  const me = toPosixRelative(root, paths.meFile);
  const project = toPosixRelative(root, paths.projectFile);
  const out: DoctorCheck[] = [];
  const hasMe = await exists(paths.meFile);
  const hasProject = await exists(paths.projectFile);

  if (!hasMe) {
    out.push({
      id,
      severity: "info",
      message: `${me} is missing: you are not onboarded yet; the agent onboards you at the next session (.wiki/system/ONBOARDING.md)`,
      file: me,
    });
  }
  if (!hasProject) {
    if (config.setup_completed_at) {
      out.push({
        id,
        severity: "warning",
        message: `${project} is missing although setup is complete`,
        fix: 'write it with the agent: .wiki/system/SETUP.md, section "2. The project"',
        file: project,
      });
    } else {
      out.push({
        id,
        severity: "info",
        message: `${project} is missing: setup writes it (.wiki/system/SETUP.md)`,
        file: project,
      });
    }
  }

  const inTree = await git.inWorkTree();
  if (inTree !== true) {
    out.push({
      id,
      severity: "info",
      message: inTree === "missing" ? "git not found; ignore checks skipped" : "not a git repository; ignore checks skipped",
    });
    return out;
  }

  if (hasMe) {
    const tracked = await git.isTracked(me);
    if (tracked) {
      out.push({
        id,
        severity: "error",
        message: `${me} is committed to git`,
        fix: `run git rm --cached ${me} and commit the removal`,
        file: me,
      });
    }
    const rule = await git.ignoreRule(me);
    const ignored = rule !== null && !rule.negated;
    if (!ignored) {
      if (rule !== null) {
        out.push({
          id,
          severity: "warning",
          message: `${me} is not ignored: ${ruleText(rule)} re-includes it`,
          fix: "remove that rule",
          file: me,
        });
      } else {
        let status: string = "absent";
        try {
          status = stripManagedBlock(await readFile(path.join(root, ".gitignore"), "utf8")).status;
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
        }
        if (status === "stripped") {
          out.push({
            id,
            severity: "warning",
            message: `${me} is not ignored: the managed .gitignore block no longer lists it`,
            fix: "run wikeeper update to refresh the managed .gitignore block",
            file: me,
          });
        } else {
          out.push({
            id,
            severity: "warning",
            message: `${me} is not ignored: .gitignore has no usable wikeeper block`,
            fix: "run wikeeper init to restore the managed .gitignore block",
            file: me,
          });
        }
      }
    }
  }

  if (hasProject) {
    const rule = await git.ignoreRule(project);
    if (rule !== null && !rule.negated) {
      out.push({
        id,
        severity: "warning",
        message: `${project} is ignored by ${ruleText(rule)}: teammates will not get the project brief`,
        fix: `remove that rule, or add !/${project} after it`,
        file: project,
      });
    }
  }

  if (!out.some((c) => c.severity !== "ok")) {
    return [{ id, severity: "ok", message: "me.md and project.md are in place" }];
  }
  return out;
}
