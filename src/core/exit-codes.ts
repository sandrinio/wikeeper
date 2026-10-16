export const ExitCode = {
  OK: 0,
  ERROR: 1,
  USAGE: 2,
  NEEDS_APPROVAL: 3,
  DENIED: 4,
  NEEDS_INPUT: 5,
} as const;
export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

export class WikeeperError extends Error {
  readonly exitCode: ExitCode;
  readonly code: string; // stable snake_case id: "error" | "usage" | "needs_approval" | "denied" | "needs_input" | story-specific
  readonly details?: unknown;
  constructor(exitCode: ExitCode, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "WikeeperError";
    this.exitCode = exitCode;
    this.code = code;
    this.details = details;
  }
}
