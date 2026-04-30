# AGENTS.md for `E:\Sales-Intelligence-Partner`

This file is the top-priority working rule for this repo.
Secondary detail sources: `CLAUDE.md` and `docs/agent-rules-*.md`.

## Default language
- Always respond in Korean.

## Default operating order
1. If a request has 2 or more issues, or spans multiple subsystems, plan first with the strongest planner available.
2. Use the plan to execute with worker agents, preferably in parallel when file scopes do not overlap.
3. Always run a separate review/verifier pass after implementation.
4. If review finds anything incomplete or risky, fix it and review again.
5. Only report completion when nothing left to change.

## Model routing
- Planning: `gpt-5.5`
- Execution: `gpt-5.4-mini`
- Review / verification: `gpt-5.4-mini`
- If a task looks like it benefits from GSD, use GSD first and keep the same model split inside that workflow.

## Workflow rules
- Use GSD workflows for non-trivial work.
- If the user gives an instruction and GSD appears useful for structure, planning, or safe modification, run GSD rather than skipping it.
- When using GSD, keep the established split: `gpt-5.5` for planning, `gpt-5.4-mini` for code edits and review.
- Prefer existing code, shared helpers, and existing docs before creating new structures.
- Create new code only when reuse is clearly worse.
- Do not delete unused code until implementation and verification are fully complete.
- For complex work, split into independent subagent tasks and run them in parallel when safe.
- When code changes are needed, prefer worker agents for implementation and a separate reviewer for verification.
- Keep direct edits narrow; use them only for trivial fixes or repo settings/doc updates.
- If a request has 2 or more issues, the plan-review-implement-review loop is mandatory by default.
- The user is the CEO; the planning model must first interpret the request, then workers implement, then the reviewer verifies before any completion report.
- Do not ask for permission between intermediate steps in the same batch unless a real decision is blocked.
- Answer all user questions that appear in the same request, even if they are separate from the code task.
- Do not modify tests unless the task explicitly asks for test changes.
- Keep the scope tight; do not add extra unrelated changes, and report known gaps instead.

## Session start
- Check `.planning/STATE.md` and `.planning/context/ACTIVE_SUMMARY.md` first.
- Run `node scripts/gsd-context-hygiene.mjs` at session start, before long work, and before final report.
- After every completed logical change, write a short checkpoint to the planning context so interrupted work can resume immediately.
- Prefer updating `.planning/context/ACTIVE_SUMMARY.md` and the latest snapshot before moving to the next chunk.
- If the repo structure is already known from the planning context, do not re-map it unless the task depends on a fresh scan.

## Repo-specific rules
- `lite-app/` is read-only for this work; do not modify it.
- QMD first for documentation/knowledge lookup when applicable.
- Financial pipeline source of truth is `financial_raw_archive`.
- Parser/storage changes must run the financial regression before completion.
- Keep review/verification strict: no completion report until the requested items are all satisfied.
- Path context: stay rooted at `E:\Sales-Intelligence-Partner` unless a task explicitly says otherwise.
- If planning needs real phone records from the financial app, request ADB connection first, verify the device is connected, and inspect the device with ADB before finalizing the plan or code changes.

## Detail references
- Workflow details: `docs/agent-rules-workflow.md`
- Validation details: `docs/agent-rules-validation.md`
- Operations details: `docs/agent-rules-operations.md`
