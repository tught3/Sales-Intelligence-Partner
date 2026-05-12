# ACTIVE SUMMARY

- generated_at: 2026-04-30T05:20:00.000Z
- latest_commit: 123020e
- snapshot_keep: 12

## Stable Context
- This repository is a pnpm workspace for the Sales Intelligence Partner app.
- The main application code lives in `artifacts/api-server` and `artifacts/sales-intelligence`.
- Shared packages live under `lib/`.
- GSD initialization has been seeded and the first user-facing fix has been applied.
- Hygiene snapshots have been written to `.planning/context/snapshots/`.

## Current Session Goal
- Audit the full usage flow for visit counts and AI generation, then tighten any remaining mismatch.
- Visit counts now use `visitLogs` plus parsed `conversationHistory` volume, so bundled history records no longer collapse to zero or undercount.
- Conversation records are mirrored into `visit_logs` on add and backfilled on startup, so the same history is visible in the visit-log flow immediately.
- Doctor detail view and visit-log entry screen both reflect the same parsed history volume and first-visit safeguard.
- AI visit generation now gets an explicit not-first-visit hint and a compact summary of recent conversation history when it exists.
- Synthetic history logs now wait for server persistence before entering cache, and the doctor-detail page refreshes after conversation save/delete so the new record is visible immediately.
- Doctor-detail history rows were refactored to remove nested buttons, eliminating hydration warnings in the browser.
- Auto-generation selection now prefers doctors not generated today, then different departments than today’s generated doctors, then lower visit counts with stable tie-breaking.
- The AI provider has been migrated from Anthropic to OpenAI Chat Completions; the frontend now sends `gpt-5.5`, and live generation was verified successfully in-browser.
- Exact duplicate visit logs and conversation records are now rejected before persistence. The client surfaces `중복된 내용입니다.` and the API returns `409` for duplicate saves.
- A temporary local api-server on port `3002` was built and used to verify duplicate rejection, then stopped again.
- Near-duplicate records are now also blocked when similarity is 80% or higher within the same doctor/date scope.
- A temporary local api-server on port `3003` was used to verify the fuzzy duplicate rule, then stopped again.
- Visit-log ordering now prefers `createdAt` so the newest generated or converted memo appears first in the history and recent-log views.
- Memo generation is being tightened so visible visit logs read like the user's own short work notes rather than long AI-style analyses. The auto-generation path now keeps `formattedLog` and `nextStrategy` separate.
- The memo-style tightening has been committed and pushed on `main`.
- Nearby UI copy on the visit-log and doctor-detail screens has also been simplified to sound more like a work memo than an analysis dashboard.
- The memo tone has now been tightened further to favor the user's sentence endings and to normalize `단회투여` into `1회 투여` during generation output handling.
- A visit-log restore through PowerShell corrupted Korean text, then a Node UTF-8 reload restored the records correctly without touching `conversationHistory`.
- ICU context selection has been narrowed to actual ICU-relevant departments. Broad substring matches like `외과`/`내과` no longer make 정형외과 receive ICU guidance.
- Product generation is now department-fit constrained across snippets, selected products, generated product lists, next strategies, and the validation pass. 플라주OP is limited to 응급/마취 contexts and excluded from 신경외과.
- Department product routing now supports weighted selection for the user-specified departments, including 정형외과 90/10, 호흡기 60/30/10, 중환자 70/20/10, and 외과 50/40/10. 신장내과-specific routing was removed.
- Memo edit and auto-generation now make the 30% objection-handling decision in code. When selected, the generated body must include both the professor's question/objection and the answer within the same 230-character visit log, with a repair call if omitted.
- Gangwon upper-tertiary hospital rules are now the active baseline: `위너프` is normalized to `위너프에이플러스`, the memo body ends with `다음 방문에는 ... 하겠다`, and the department map now follows the user's hospital-specific target set.
- Auto-generation target selection still prefers doctors with fewer visits, but it now pushes down anyone who already had a memo conversion or auto-generated visit log during the current week.
- Department-specific feature themes are now constrained as well, so memo edit and auto-generation avoid mismatched detail points like IBD in orthopedics.
- New-drug review wording is now controlled by an explicit 10% allow flag for non-introduced products only, and recent detail keywords are used to push repeated snippet points behind fresher detail points.

## Useful Entry Points
- `package.json`
- `artifacts/api-server/src/index.ts`
- `artifacts/api-server/src/app.ts`
- `artifacts/sales-intelligence/src/App.tsx`
