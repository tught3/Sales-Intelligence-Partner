# STATE

## Current State
- GSD is now initialized for `E:\Sales-Intelligence-Partner` with a local `.planning` baseline.
- The repository is a brownfield TypeScript monorepo with the app split across `artifacts/` and shared code in `lib/`.
- Visit-count fallback and AI first-visit safeguards have been implemented in the sales-intelligence frontend, including doctor detail and visit-log screens.
- Conversation-history records are now mirrored into `visit_logs` immediately when they are added, and backfilled on startup so older records are visible in the same flow.
- Visit counting now treats `conversationHistory` as real visit volume by parsing the record metadata instead of assuming one record equals one visit.
- Synthetic history logs now persist only after server success, and the doctor-detail view refreshes its visit list immediately after conversation saves/deletes.
- Doctor-detail nested-button hydration warnings were fixed by making expandable history rows keyboard-accessible `div` elements instead of nested buttons.
- Automatic visit-log target selection now uses stable tie-breaking: unseen today first, different department second, then lower record counts with deterministic randomization only for ties.
- Local browser verification succeeded for doctors, visit-log, and doctor-detail screens, but live AI generation is currently blocked by Anthropic credit balance on the API side.
- AI provider migration to OpenAI is complete: the server now proxies `/api/ai/chat` to OpenAI Chat Completions, the frontend sends `gpt-5.5`, and a live generation test passed end-to-end.
- Duplicate prevention has been added for visit logs and conversation records. Exact duplicates now return `중복된 내용입니다.` and are not persisted, and the API route also returns `409` for duplicate saves.
- Verified the duplicate guard against a temporary local api-server on port `3002` before stopping it again.

## Immediate Next Step
- Report the duplicate-prevention work with verification evidence and note the saved planning checkpoints.

## Known Structure
- `artifacts/api-server`
- `artifacts/sales-intelligence`
- `lib/db`
- `lib/api-zod`

## Notes
- Keep future work narrow and verified.
- Update the planning context after each meaningful change.
