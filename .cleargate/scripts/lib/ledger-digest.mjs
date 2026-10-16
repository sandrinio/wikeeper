#!/usr/bin/env node
/**
 * ledger-digest.mjs — Shared helper for token-ledger JSONL parsing and aggregation.
 *
 * Named exports (no default):
 *   parseJsonl(filePath)     — parse JSONL file tolerating malformed lines
 *   normalizeRow(row)        — schema-tolerant extraction of work_item_id, agent_type, delta
 *   aggregate(rows)          — compute totals, by_agent, by_work_item
 *   detectAnomalies(byWorkItem, threshold=4) — flag work items > threshold × median
 *
 * Schema-tolerance (R-Risk #2 from STORY-025-01):
 *   - work_item_id: row.work_item_id || row.work_item || row.story_id (empty-string → null)
 *   - agent_type:   row.agent_type || row.agent || 'unknown'
 *   - delta:        row.delta || { input:0, output:0, cache_creation:0, cache_read:0 }
 *
 * Unknown agent_types are bucketed into by_agent.unknown — the aggregator MUST NOT crash
 * on schema drift (see SPRINT-17 ledger: SubagentStop attribution may not match expected
 * agent types).
 *
 * Exit codes: none (library module — callers control exit).
 */

import fs from 'node:fs';

/**
 * Parse a JSONL file, returning an array of parsed objects.
 * Skips malformed lines with a stderr warning.
 * Returns [] if the file does not exist (caller decides if that is an error).
 * @param {string} filePath
 * @returns {object[]}
 */
export function parseJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(l => l.trim());
  const results = [];
  for (const line of lines) {
    try {
      results.push(JSON.parse(line));
    } catch {
      process.stderr.write(`Warning: skipping malformed JSONL line: ${line.slice(0, 80)}\n`);
    }
  }
  return results;
}

/**
 * Normalize a raw ledger row to a canonical shape.
 * Applies schema-tolerant field extraction (see header comment).
 * @param {object} row
 * @returns {{ work_item_id: string|null, agent_type: string, delta: object }}
 */
export function normalizeRow(row) {
  // work_item_id: prefer explicit work_item_id, fallback to work_item, then story_id.
  // Treat empty string as null (real case: SPRINT-17 rows have story_id="").
  const rawId = row.work_item_id || row.work_item || row.story_id || '';
  const work_item_id = rawId.trim() || null;

  const agent_type = row.agent_type || row.agent || 'unknown';

  const delta = row.delta || { input: 0, output: 0, cache_creation: 0, cache_read: 0 };
  const normalizedDelta = {
    input: delta.input || 0,
    output: delta.output || 0,
    cache_creation: delta.cache_creation || 0,
    cache_read: delta.cache_read || 0,
  };

  // Warn to stderr if schema fallbacks were used (per R-Risk #2).
  if (!row.work_item_id && (row.work_item || row.story_id)) {
    process.stderr.write(
      `Warning: normalizeRow fallback triggered for work_item_id — using ` +
      `"${work_item_id}" from ${row.work_item ? 'work_item' : 'story_id'} field\n`
    );
  }
  if (!row.agent_type && (row.agent)) {
    process.stderr.write(
      `Warning: normalizeRow fallback triggered for agent_type — using "${agent_type}" from agent field\n`
    );
  }

  return { work_item_id, agent_type, delta: normalizedDelta };
}

/**
 * Aggregate an array of normalized rows into token-count summaries.
 * @param {Array<{ work_item_id: string|null, agent_type: string, delta: object }>} rows
 * @returns {{
 *   total: { input: number, output: number, cache_creation: number, cache_read: number, sum: number },
 *   by_agent: { [agent: string]: { sum: number, dispatches: number } },
 *   by_work_item: { [id: string]: { sum: number, dispatches: number } },
 *   anomalies: Array<{ work_item_id: string, sum: number, multipleOfMedian: number }>
 * }}
 */
export function aggregate(rows) {
  const total = { input: 0, output: 0, cache_creation: 0, cache_read: 0, sum: 0 };
  const by_agent = {};
  const by_work_item = {};

  for (const row of rows) {
    const { work_item_id, agent_type, delta } = row;
    const rowSum = delta.input + delta.output + delta.cache_creation + delta.cache_read;

    // Total
    total.input += delta.input;
    total.output += delta.output;
    total.cache_creation += delta.cache_creation;
    total.cache_read += delta.cache_read;
    total.sum += rowSum;

    // By agent
    if (!by_agent[agent_type]) by_agent[agent_type] = { sum: 0, dispatches: 0 };
    by_agent[agent_type].sum += rowSum;
    by_agent[agent_type].dispatches += 1;

    // By work item — null IDs go to bucket 'unassigned'
    const itemKey = work_item_id || 'unassigned';
    if (!by_work_item[itemKey]) by_work_item[itemKey] = { sum: 0, dispatches: 0 };
    by_work_item[itemKey].sum += rowSum;
    by_work_item[itemKey].dispatches += 1;
  }

  const anomalies = detectAnomalies(by_work_item);
  return { total, by_agent, by_work_item, anomalies };
}

/**
 * Detect anomalous work items whose total token cost exceeds threshold × median.
 * @param {{ [id: string]: { sum: number, dispatches: number } }} byWorkItem
 * @param {number} threshold — default 4 (per STORY-025-01 §1.4 + CR-021 §3.2.5)
 * @returns {Array<{ work_item_id: string, sum: number, multipleOfMedian: number }>}
 */
export function detectAnomalies(byWorkItem, threshold = 4) {
  const entries = Object.entries(byWorkItem);
  if (entries.length === 0) return [];

  const sums = entries.map(([, v]) => v.sum).sort((a, b) => a - b);
  const mid = Math.floor(sums.length / 2);
  const median = sums.length % 2 === 0
    ? (sums[mid - 1] + sums[mid]) / 2
    : sums[mid];

  if (median === 0) return [];

  const anomalies = [];
  for (const [id, { sum }] of entries) {
    const multiple = sum / median;
    if (multiple > threshold) {
      anomalies.push({
        work_item_id: id,
        sum,
        multipleOfMedian: Math.round(multiple * 10) / 10,
      });
    }
  }
  return anomalies;
}
