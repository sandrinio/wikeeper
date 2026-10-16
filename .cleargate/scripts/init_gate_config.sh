#!/usr/bin/env bash
# init_gate_config.sh — Idempotent seeder for gate-checks.json
# Usage: init_gate_config.sh [--config-path <path>]
# If gate-checks.json already exists, exits 0 without overwriting.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_PATH="${SCRIPT_DIR}/gate-checks.json"

# Allow override via argument
if [[ "${1:-}" == "--config-path" && -n "${2:-}" ]]; then
  CONFIG_PATH="$2"
fi

if [[ -f "$CONFIG_PATH" ]]; then
  echo "gate-checks.json already exists at ${CONFIG_PATH} — no-op." >&2
  exit 0
fi

cat > "$CONFIG_PATH" << 'EOF'
{
  "schema_version": 1,
  "qa": {
    "typecheck": "npm run typecheck",
    "debug_patterns": ["console.log", "console.debug", "debugger"],
    "todo_patterns": ["TODO", "FIXME", "XXX"],
    "test": "npm test"
  },
  "arch": {
    "typecheck": "npm run typecheck",
    "new_deps_check": true,
    "stray_env_files": [".env", ".env.local", ".env.production"],
    "file_count_report": true
  }
}
EOF

echo "gate-checks.json created at ${CONFIG_PATH}" >&2
