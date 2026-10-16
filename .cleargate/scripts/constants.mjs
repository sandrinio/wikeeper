/**
 * ClearGate Execution Phase — Constants
 *
 * state.json v3 Schema (STORY-070-01: execution_mode retired — single always-enforced behavior):
 *
 * {
 *   "schema_version": 3,          // integer, mandatory
 *   "sprint_id": "S-NN",          // string
 *   "sprint_status": "Active",    // string
 *   "stories": {
 *     "STORY-NNN-NN": {
 *       "state": "Ready to Bounce",  // one of VALID_STATES
 *       "qa_bounces": 0,             // integer 0..BOUNCE_CAP
 *       "arch_bounces": 0,           // integer 0..BOUNCE_CAP
 *       "worktree": null,            // string|null — path to worktree checkout
 *       "updated_at": "<ISO-8601>",  // string
 *       "notes": "",                 // string
 *       "lane": "standard",          // default "standard"
 *       "lane_assigned_by": "architect" | "human-override" | "migration-default",
 *       "lane_demoted_at": "<ISO-8601>" | null,
 *       "lane_demotion_reason": string | null
 *     }
 *   },
 *   "last_action": "<string>",    // human-readable last operation
 *   "updated_at": "<ISO-8601>"    // string
 * }
 *
 * Break-glass env var: CLEARGATE_ADVISORY=1 downgrades gate failures to warnings.
 */

export const SCHEMA_VERSION = 3;

export const BOUNCE_CAP = 3;

export const VALID_STATES = [
  'Ready to Bounce',
  'Bouncing',
  'QA Passed',
  'Architect Passed',
  'Sprint Review',
  'Done',
  'Escalated',
  'Parking Lot',
];

export const TERMINAL_STATES = ['Done', 'Escalated', 'Parking Lot'];

/**
 * Canonical state-machine transitions table.
 * Key: current state. Value: array of allowed next states.
 * Terminal states have empty arrays (no transitions out).
 */
export const STATE_TRANSITIONS = {
  'Ready to Bounce':   ['Bouncing', 'Parking Lot'],
  'Bouncing':          ['QA Passed', 'Ready to Bounce', 'Escalated', 'Parking Lot'],
  'QA Passed':         ['Architect Passed', 'Ready to Bounce', 'Escalated', 'Parking Lot'],
  'Architect Passed':  ['Sprint Review', 'Ready to Bounce', 'Escalated', 'Parking Lot'],
  'Sprint Review':     ['Done', 'Ready to Bounce', 'Escalated', 'Parking Lot'],
  'Done':              [],
  'Escalated':         [],
  'Parking Lot':       [],
};
