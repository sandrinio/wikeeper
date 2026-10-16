#!/usr/bin/env node
/**
 * qa_red_lint.mjs — Semantic QA-Red fixture lint (CR-081).
 *
 * Usage: node .cleargate/scripts/qa_red_lint.mjs <dir>
 *
 * Globs QA-Red test files under <dir> by their red-test naming convention:
 *   *.red.node.test.ts  (meta-repo default)
 *   *.red.test.ts
 *   *.red.test.tsx
 *   test_*_red.py
 *
 * Scope: ONLY actual test files — NOT *.red.sh bash harnesses (prevents
 * self-flagging the CR-081 harness which contains HEREDOC fixture strings).
 *
 * Exit 0 = clean (no flags).
 * Exit 1 = ≥1 rule flagged (messages written to stderr: file:line rule-id fix).
 *
 * Rule registry (structured for growth — R-enum + R-query only in first ship):
 *
 * R-enum: Detects when a fixture constructs a typed model with an enum/Literal
 *   field whose argument is a string literal NOT in the statically-declared set.
 *   Conservative: only flags when BOTH the declared set AND the out-of-set
 *   literal are statically resolvable in the same file. Never flags when the set
 *   cannot be resolved.
 *
 * R-query: Flags queryByText(<s>) / getByText(<s>) whose target string <s> is
 *   duplicated across ≥2 rows in the same render-input literal within the test
 *   body. Recommends queryAllByText(<s>)[0] / getByTestId(...).
 *
 * No-false-flag guarantee: a file with no out-of-set Literal AND no
 * duplicate-string getByText/queryByText → zero flags → exit 0.
 * This specifically ensures CR-082's plain node:test file exits 0.
 */

import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Rule registry — {id, description, scan(fileText) -> [{line, message}]}
// ---------------------------------------------------------------------------

/**
 * R-enum: Detect out-of-set literal in a Pydantic-style or TS-union typed constructor.
 *
 * Pattern:
 *   1. Find Literal[...] declarations — e.g. Literal["a", "b", "c"]
 *   2. Find TS string-union type aliases — e.g. type Theme = "a" | "b" | "c"
 *   3. Find TS enums — e.g. enum Theme { A = "a", B = "b" }
 *   4. Find constructor/prop calls that pass a bare string literal for a field
 *      whose allowed set was found in step 1-3.
 *   5. Flag if the string literal is NOT in the allowed set.
 *
 * Conservative: only flags when set resolution succeeded AND the literal is
 * statically visible (a bare string, not a variable/expression).
 */
const rEnum = {
  id: 'R-enum',
  description: 'Constructed-fixture enum/Literal validity — literal argument not in declared set',
  scan(fileText) {
    const flags = [];
    const lines = fileText.split('\n');

    // ---- Step 1: Extract Pydantic Literal[...] sets ----
    // Pattern: Literal["a", "b", "c"] or Literal['a', 'b', 'c']
    // We collect all such sets from the file and build a map of set_values → declared.
    // We then check constructor kwarg calls where theme=<literal>.
    //
    // Strategy: scan the file for lines containing Literal[...] and extract members.
    // Then scan for constructor kwargs of the form field="value" or field='value'
    // where the field name matches a Literal-typed field seen earlier.

    /** @type {Map<string, {values: Set<string>, fieldName: string}>} */
    const literalSets = new Map(); // fieldName -> {values}

    // Regex: <fieldName>: Literal["v1", "v2", ...]
    // Handles multi-line with a single-line scan (most fixture files are compact)
    const literalTypeRegex = /(\w+)\s*:\s*Literal\[([^\]]+)\]/g;
    for (const match of fileText.matchAll(literalTypeRegex)) {
      const fieldName = match[1];
      const rawValues = match[2];
      const values = new Set();
      // Extract quoted strings from the Literal[...] content
      for (const vm of rawValues.matchAll(/["']([^"']+)["']/g)) {
        values.add(vm[1]);
      }
      if (values.size > 0) {
        literalSets.set(fieldName, values);
      }
    }

    // ---- Step 2: Extract TS string-union type aliases ----
    // Pattern: type <Name> = "a" | "b" | "c"
    // We map the type NAME to its value set.
    /** @type {Map<string, Set<string>>} */
    const tsUnionTypes = new Map(); // typeName -> values

    const tsUnionRegex = /type\s+(\w+)\s*=\s*((?:"[^"]*"|'[^']*')\s*(?:\|\s*(?:"[^"]*"|'[^']*')\s*)*)/g;
    for (const match of fileText.matchAll(tsUnionRegex)) {
      const typeName = match[1];
      const rawUnion = match[2];
      const values = new Set();
      for (const vm of rawUnion.matchAll(/["']([^"']+)["']/g)) {
        values.add(vm[1]);
      }
      if (values.size > 0) {
        tsUnionTypes.set(typeName, values);
      }
    }

    // ---- Step 3: Extract TS enums ----
    // Pattern: enum <Name> { A = "a", B = "b" }
    /** @type {Map<string, Set<string>>} */
    const tsEnums = new Map(); // enumName -> values

    const tsEnumRegex = /enum\s+(\w+)\s*\{([^}]+)\}/g;
    for (const match of fileText.matchAll(tsEnumRegex)) {
      const enumName = match[1];
      const body = match[2];
      const values = new Set();
      for (const vm of body.matchAll(/=\s*["']([^"']+)["']/g)) {
        values.add(vm[1]);
      }
      if (values.size > 0) {
        tsEnums.set(enumName, values);
      }
    }

    // Merge all TS typed sets into a field-name map.
    // For TS: we also look for prop declarations like: fieldName: TypeName
    // and then check constructor calls with fieldName: "value"
    /** @type {Map<string, Set<string>>} */
    const allFieldSets = new Map(literalSets); // start with Python Literal sets

    // For TS unions and enums, find property declarations that use them:
    // pattern: <fieldName>: <TypeName>  (in interfaces or class definitions)
    const tsPropDeclRegex = /(\w+)\s*:\s*(\w+)/g;
    for (const match of fileText.matchAll(tsPropDeclRegex)) {
      const propName = match[1];
      const typeName = match[2];
      const values = tsUnionTypes.get(typeName) ?? tsEnums.get(typeName);
      if (values && !allFieldSets.has(propName)) {
        allFieldSets.set(propName, values);
      }
    }

    if (allFieldSets.size === 0) {
      // No declared sets found — nothing to check
      return flags;
    }

    // ---- Step 4: Check constructor/object calls for out-of-set literals ----
    // Python: FieldName(field="value") or FieldName(field='value')
    // TS: { field: "value" } or field="value" in JSX/React props

    for (const [fieldName, allowedValues] of allFieldSets) {
      // Scan every line with the given regex (capture group 1 = the literal),
      // flagging any literal not in allowedValues. Shared by the Python-kwarg
      // and TS-object-prop passes below (identical flag logic, different regex).
      const scanForOutOfSet = (regex) => {
        let lineIndex = 0;
        for (const line of lines) {
          lineIndex++;
          for (const match of line.matchAll(regex)) {
            const literal = match[1];
            if (!allowedValues.has(literal)) {
              flags.push({
                line: lineIndex,
                message: `R-enum: field "${fieldName}" value "${literal}" is not in the declared set [${[...allowedValues].map(v => `"${v}"`).join(', ')}]. Fix: use one of the declared values.`,
              });
            }
          }
        }
      };

      // Python kwarg: fieldName="value" or fieldName='value'
      const pythonKwargRegex = new RegExp(
        `\\b${fieldName}\\s*=\\s*["']([^"']+)["']`,
        'g'
      );
      scanForOutOfSet(pythonKwargRegex);

      // TS object prop: fieldName: "value" — only when it looks like a value assignment (in { } context)
      // We look for patterns like:   fieldName: "value"  but NOT  fieldName: TypeName  (declaration)
      // Heuristic: in the same line, if it's preceded by whitespace or comma+whitespace and followed
      // by a string literal (not a type identifier like a capital-letter word), flag it.
      const tsObjPropRegex = new RegExp(
        `(?:,|\\{|^)\\s*${fieldName}\\s*:\\s*["']([^"']+)["']`,
        'g'
      );
      scanForOutOfSet(tsObjPropRegex);
    }

    return flags;
  },
};

/**
 * R-query: Detect queryByText(<s>) / getByText(<s>) where <s> appears on
 * ≥2 rows in the same render-input object literal within the test body.
 *
 * Pattern:
 *   1. Find array literals used as render input (rows/data/items arrays)
 *      that contain objects with string values.
 *   2. Collect all string values that appear ≥2 times across the array items.
 *   3. For each queryByText/getByText call whose argument matches a duplicated string,
 *      flag it with a recommendation.
 *
 * Conservative: only flags when:
 *   - The duplicated string is a plain string literal (not variable).
 *   - The queryByText/getByText call uses the exact same plain string literal.
 */
const rQuery = {
  id: 'R-query',
  description: 'query-by-text single-match hazard — target text is duplicated in render input',
  scan(fileText) {
    const flags = [];
    const lines = fileText.split('\n');

    // ---- Step 1: Collect all string literals that appear ≥2 times in object
    // property values within array literals (render-input rows). ----
    //
    // Strategy: scan the file for string literal values in object contexts.
    // Count occurrences of each string value in what looks like array-of-objects.
    //
    // We use a conservative heuristic: look for patterns like:
    //   detail: 'Connected'  or  detail: "Connected"
    //   status: 'ok'
    // within array contexts (we check the whole file for simplicity,
    // counting how many times each value appears in property contexts).
    //
    // Strip line comments (//) before scanning to avoid counting comment text.

    /** @type {Map<string, number>} */
    const propValueCounts = new Map();

    // Strip single-line (//) comments before scanning for property values.
    // This prevents comment text from inflating property value counts.
    const strippedLines = lines.map(line => {
      // Remove // comment suffix — naive but sufficient for fixture files.
      // Does not handle strings containing // (e.g. URLs in strings) but
      // fixture files in QA-Red tests rarely contain such patterns.
      const commentIdx = line.indexOf('//');
      return commentIdx >= 0 ? line.slice(0, commentIdx) : line;
    });
    const strippedText = strippedLines.join('\n');

    // Match object property assignments: key: "value" or key: 'value'
    // We want the VALUE part (the string literal)
    // Only scan non-comment portions of the file.
    const objPropValueRegex = /:\s*["']([^"']+)["']/g;
    for (const match of strippedText.matchAll(objPropValueRegex)) {
      const val = match[1];
      propValueCounts.set(val, (propValueCounts.get(val) ?? 0) + 1);
    }

    // Find strings that appear ≥2 times as property values
    const duplicatedValues = new Set(
      [...propValueCounts.entries()]
        .filter(([, count]) => count >= 2)
        .map(([val]) => val)
    );

    if (duplicatedValues.size === 0) {
      return flags;
    }

    // ---- Step 2: Find queryByText / getByText calls that use duplicated strings ----
    const queryRegex = /(?:queryByText|getByText)\(\s*["']([^"']+)["']\s*\)/g;
    let lineIndex = 0;
    for (const line of lines) {
      lineIndex++;
      for (const match of line.matchAll(queryRegex)) {
        const queryStr = match[1];
        if (duplicatedValues.has(queryStr)) {
          const fnName = match[0].startsWith('queryByText') ? 'queryByText' : 'getByText';
          flags.push({
            line: lineIndex,
            message: `R-query: ${fnName}('${queryStr}') targets a string that appears on ≥2 rows in the render input — this will throw "Found multiple elements". Fix: use queryAllByText('${queryStr}')[0] or getByTestId(...) instead.`,
          });
        }
      }
    }

    return flags;
  },
};

// ---------------------------------------------------------------------------
// Rule registry (ordered; add new rules by appending)
// ---------------------------------------------------------------------------
const RULES = [rEnum, rQuery];

// ---------------------------------------------------------------------------
// File glob — scan only red test files, NOT bash harnesses
// ---------------------------------------------------------------------------
const RED_TEST_EXTENSIONS = [
  /\.red\.node\.test\.ts$/,
  /\.red\.test\.ts$/,
  /\.red\.test\.tsx$/,
  /^test_.*_red\.py$/,
];

/**
 * Recursively collect all red-test files under a directory.
 * Excludes node_modules, .git, and *.red.sh files (bash harnesses).
 * @param {string} dir
 * @returns {string[]} absolute paths
 */
function collectRedTestFiles(dir) {
  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      results.push(...collectRedTestFiles(fullPath));
    } else if (entry.isFile()) {
      const name = entry.name;
      // Must match a red-test pattern AND must NOT be a .sh file
      if (name.endsWith('.sh')) continue;
      if (RED_TEST_EXTENSIONS.some(re => re.test(name))) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const [, , dirArg] = process.argv;

if (!dirArg) {
  process.stderr.write('Usage: node qa_red_lint.mjs <dir>\n');
  process.exit(2);
}

const targetDir = path.resolve(dirArg);

if (!fs.existsSync(targetDir)) {
  process.stderr.write(`qa_red_lint: directory does not exist: ${targetDir}\n`);
  process.exit(2);
}

const testFiles = collectRedTestFiles(targetDir);

let totalFlags = 0;

for (const filePath of testFiles) {
  let fileText;
  try {
    fileText = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    process.stderr.write(`qa_red_lint: cannot read ${filePath}: ${err.message}\n`);
    continue;
  }

  for (const rule of RULES) {
    let ruleFlags;
    try {
      ruleFlags = rule.scan(fileText);
    } catch {
      // Never crash on malformed input — rule scan failure is non-fatal
      continue;
    }
    for (const flag of ruleFlags) {
      process.stderr.write(`${filePath}:${flag.line}: [${rule.id}] ${flag.message}\n`);
      totalFlags++;
    }
  }
}

process.exit(totalFlags > 0 ? 1 : 0);
