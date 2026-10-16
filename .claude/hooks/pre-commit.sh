#!/usr/bin/env bash
# pre-commit.sh — Dispatcher: chains all pre-commit-*.sh hooks in lexical order.
#
# Install: ln -sf ../../.claude/hooks/pre-commit.sh .git/hooks/pre-commit
#
# Each pre-commit-*.sh is expected to exit 0 on success or non-zero to block.
# The dispatcher exits on the first non-zero exit code.

set -euo pipefail

# Resolve HOOK_DIR through any symlink chain. Git invokes this script as
# .git/hooks/pre-commit, a symlink; bash does not dereference BASH_SOURCE, so
# a plain `dirname "${BASH_SOURCE[0]}"` resolves to .git/hooks, not this
# file's real directory. Walk the chain by hand (portable: BSD readlink has
# no -f, and this machine's bash is 3.2 — no readlink -f, no realpath).
SOURCE="${BASH_SOURCE[0]}"
while [ -L "${SOURCE}" ]; do
  LINK_DIR="$(cd -P "$(dirname "${SOURCE}")" && pwd)"
  SOURCE="$(readlink "${SOURCE}")"
  case "${SOURCE}" in
    /*) ;;                                  # absolute target — take as-is
    *)  SOURCE="${LINK_DIR}/${SOURCE}" ;;   # relative target — resolve against the link's dir
  esac
done
HOOK_DIR="$(cd -P "$(dirname "${SOURCE}")" && pwd)"

for hook in "${HOOK_DIR}"/pre-commit-*.sh; do
  [[ -f "${hook}" ]] || continue
  [[ -x "${hook}" ]] || continue
  bash "${hook}" || exit $?
done

exit 0
