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
- Duplicate prevention now also blocks near-duplicates: records with 80%+ similarity are treated as duplicates within the same doctor and visit-date scope.
- Verified the 80% similarity rule against a temporary local api-server on port `3003` before stopping it again.
- Visit-log lists now sort by `createdAt` first so the most recently created memo conversion or auto-generated log appears at the top of the history and recent-log views.
- Visit-log generation is being tightened again so the visible memo reads like the user's own short work note, not an analysis report. Auto-generation now separates `formattedLog` and `nextStrategy` instead of merging them.
- The memo-style tightening has been committed and pushed.
- Nearby UI copy in the visit-log and doctor-detail screens was also simplified so the app speaks more like a work memo and less like an analysis tool.
- The memo tone has been tightened further so generated text prefers the user's endings like `~함`, `~예정`, `~부탁`, `~드림`, and `~필요`, while blocking `~습니다`-style endings and normalizing `단회투여` to `1회 투여`.
- A visit-log restore attempted through PowerShell mangled Korean text into `?`; the records were then reloaded with Node `fetch` UTF-8 and restored correctly.
- Visit-log generation now restricts ICU context to ICU-relevant departments instead of broad `외과`/`내과` substring matches, so 정형외과 no longer receives ICU guidance.
- Visit-log generation now filters snippets, selected products, generated product lists, and review output by department-appropriate products; 플라주OP is limited to 응급/마취 contexts and excluded from 신경외과.
- Department product routing now supports weighted product selection for generation: 정형외과 90/10 페린젝트/이부프로펜프리믹스, 호흡기 60/30/10 위너프에이플러스/페린젝트/프리페넴, 중환자 70/20/10 위너프에이플러스/페린젝트/포스페넴, 외과 50/40/10 위너프에이플러스/페린젝트/이부프로펜프리믹스. 신장내과-specific routing was removed.
- Objection handling is now controlled in code with a 30% chance per memo conversion/auto-generation. When selected, the prompt requires both the objection/question and the answer inside the 230-character visit-log body, with a repair pass if the first result omits it.
- Gangwon upper-tertiary hospital rules are now the active routing baseline: `위너프` is normalized to `위너프에이플러스`, the memo body must end with `다음 방문에는 ... 하겠다`, and the department map now reflects the user's hospital-specific target set.
- Auto-generation target selection now keeps the low-visit-count ordering, but within that ordering it deprioritizes any doctor who already received a memo conversion or auto-generated visit log during the current week.
- Department-specific feature themes are now constrained too, so memo edit and auto-generation avoid cross-department spillover like IBD showing up in orthopedics.
- New-drug review wording is now gated by an explicit 10% allow flag for non-introduced products only; introduced products never receive that wording, and recent detail points are used to deprioritize repeated snippets.
- Visit-log body no longer forces a `다음 방문에는 ... 하겠다` ending. Next-visit plans are kept out of the memo body and normalized into the separate `nextStrategy` field.
- Auto-generation now requires selecting exactly one hospital scope first; the all-hospital option is hidden in the auto tab and generation is blocked until a hospital is selected.
- Visit-log generation now suppresses unnecessary `포인트` wording and cleans invalid `지난번에 ... 했는데` transitions unless the prior-detail result or professor response is completed.
- Department product routing now uses `플라주OP 70% / 제이세덱스 30%` for anesthesiology and adds emergency medicine with the same split.

## Immediate Next Step
- Report the Gangwon hospital rule reset with typecheck evidence.

## Latest Checkpoint
- Visit-log generation now catches bare `지난번 ...` openings and removes the previous-visit framing when there is no actual feedback/result before the new detail.
- If a previous sentence says the same product is already in use, generation no longer keeps `오늘은 같은 제품 중심으로`; it is normalized toward usage reaction, reorder volume, or applicable patient-group follow-up.
- Bulk auto-generation passes already-generated logs from the same batch into the next generation and validation pass so repeated objection/answer/detail phrases are avoided within one hospital run.

## Known Structure
- `artifacts/api-server`
- `artifacts/sales-intelligence`
- `lib/db`
- `lib/api-zod`

## Notes
- Keep future work narrow and verified.
- Update the planning context after each meaningful change.
