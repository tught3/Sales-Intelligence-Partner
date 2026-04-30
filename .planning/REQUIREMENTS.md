# REQUIREMENTS

## Session Initialization
- Create a stable GSD baseline for this repository.
- Preserve the existing brownfield codebase and documentation.
- Do not change application behavior during initialization.

## Working Rules
- Use plan-first workflow for any non-trivial change.
- Prefer targeted verification over full-repo validation when the scope is narrow.
- Keep changes localized to the files that actually need to move.

## Readiness Criteria
- `.planning/STATE.md` reflects the current repo status.
- `.planning/context/ACTIVE_SUMMARY.md` captures the active checkpoint.
- The repository can move into the next requested implementation task without re-orienting from scratch.
