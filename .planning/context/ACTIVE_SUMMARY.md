# ACTIVE SUMMARY

- generated_at: 2026-04-30T04:35:00.000Z
- latest_commit: 49ad391
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

## Useful Entry Points
- `package.json`
- `artifacts/api-server/src/index.ts`
- `artifacts/api-server/src/app.ts`
- `artifacts/sales-intelligence/src/App.tsx`
