# ACTIVE SUMMARY

- generated_at: 2026-04-30T05:20:00.000Z
- latest_commit: 123020e
- snapshot_keep: 12

## Stable Context
- This repository is a pnpm workspace for the Sales Intelligence Partner app.
- The active local checkout path is now `E:\Project\Sales-Intelligence-Partner`.
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
- The forced `다음 방문에는 ... 하겠다` memo ending has been removed; next-visit planning text is stripped from the body and kept in the separate `nextStrategy` field.
- Auto-generation requires selecting one hospital first; the all-hospital option is hidden in the auto tab and the bulk generation button is disabled until a hospital is selected.
- Visit-log generation now reduces unnecessary `포인트` wording and hard-cleans broken previous-visit transitions that do not include the prior-detail result or professor response.
- Department routing now sets anesthesiology and emergency medicine to `플라주OP 70% / 제이세덱스 30%`.

## Latest Checkpoint
- 산부인과 템플릿을 페린젝트/위너프 각각에 대해 더 세분화했고, 실사례 검증은 3건 모두 통과할 때까지 반복했습니다.
- 최종 샘플 3건은 `convertToVisitLog`/`autoGenerateVisitLog`를 실제 번들된 모듈로 호출해서 확인했고, 본문과 nextStrategy 모두 눈에 띄는 이상 표현 없이 정리됐습니다.
- 샘플 검증 중에는 `경구용철분제` 비교 문구, `보겠음`, `확인드릴`, `편할예정며`, `환자군 환자` 같은 잔재를 단계적으로 제거했습니다.
- `nextStrategy` 중복 판정이 `실제 적용/처방 흐름/차트상 조건/적용 가능` 같은 유사 표현까지 키로 잡도록 강화했습니다.
- follow-up 후보 선택은 `getDetailKeyOverlap()`와 새 키 기반 판정을 같이 보며, 본문과 같은 축이면 다시 다른 축으로 재선택합니다.
- 산부인과/페린젝트 분기에서 더 구체적인 후보를 추가해, 같은 과에서라도 환자군-상황-특장점 축이 더 자주 바뀌도록 했습니다.
- `nextStrategy` 정규화는 이제 길이 제한 전에 한 번, 길이 제한 후에 한 번 더 돌도록 바뀌어서 잘린 문장이 그대로 남지 않게 했습니다.
- `sanitizeNextStrategyText()`는 마지막 `다음...` 구간만 남기고 `다음방문시에는 ... 확인할예정` 형태로 재조립해서, `다음엔 ... 다음방문시에는 ...할예정` 같은 중첩을 막습니다.
- 영업일지 본문은 최종 정리 단계에서 다시 `sanitizeVisitLogBody()`와 `trimAfterReactionSentence()`를 거치도록 유지해서, 다음 방문 계획 문구가 본문에 섞이는 걸 더 강하게 막았습니다.
- Obstetrics product routing now defaults to 페린젝트 only, so the normal generation path should no longer drift to 위너프에이플러스 unless a manual product scope explicitly forces it.
- Visit-log generation now trims the body after the professor reaction sentence, blocks generic reaction/strategy phrasing, and biases follow-up selection toward a different product when one is available.
- Visit-log generation now strips foreign product sentences and next-visit leakage from the body before validation, so the visible memo stays on a single product and the nextStrategy stays separate.
- Raw visit notes for 산부인과 can now steer product selection from the note content itself, so explicit 위너프/TPN-style cases can still resolve to 위너프에이플러스 while 빈혈/Hb cases stay on 페린젝트.
- The visit-log candidate pool was widened with more 산부인과-specific Winuf/페린젝트 templates plus extra fallback details, so the planner has more non-overlapping product/detail axes to rotate through.
- A second wave of department-specific templates was added as an extra pool for 정형외과, 호흡기, 외과, 신경외과, 중환자, 소화기, 종양, 산부인과, 신장, 마취과, and 응급의학과, and the Visit Log UI now shows a short product-selection hint per department.
- 산부인과 raw-note inference now only admits 위너프에이플러스 on explicit Winuf/TPN-style signals, and the Visit Log product buttons now visually recommend the department-fit product without overwriting a manual selection.
- Final visit-log cleanup now strips `위너프에이플러스의` from nextStrategy, removes embedded next-visit phrases from the body more aggressively, and prevents duplicate `다음방문시에는`/`할예정` suffixes from surviving the last normalization pass.
- NextStrategy is now reassembled into a stricter one-line format during final sanitation, with product prefixes removed before the final `다음방문시에는 ... 할예정` pattern is emitted.
- Snippet analysis now prints a department-wide coverage line so matching specialties are shown across both hospitals, and auto-generation prompt text now explicitly tells the model to consider both Gangneung Asan and Wonju Severance when a department fits both hospitals.
- Core snippet generation no longer relies on product-info titles only; product manual matching now inspects title and content, and snippet duplicate filtering now requires stronger overlap than a single shared meaning key. Product and snippet-library generation toasts also distinguish AI returning no candidates from candidates being filtered as duplicates.
- Visit-log auto-generation is now locked to `위너프에이플러스`, `페린젝트`, and `플라주OP` only. Batch generation with 3 or more targets forces `플라주OP` until one saved log contains it, the visit-log product selector only shows the three allowed products, department product routing excludes the old products, and bare `플라주` output is normalized to `플라주OP`. `pnpm run typecheck` passed; individual frontend/API builds passed after the root build timed out.
- Visit-log generation now surfaces more core-ment candidates and pushes recent repeats down harder: snippet candidates increased from 4 to 8, recent detail comparison widened from 5 to 16 logs, recent keyword memory widened to 12 logs, hardcoded repeated examples were removed from the anti-repeat prompt, and recent style examples are sanitized so `포인트` does not get re-primed. `pnpm run typecheck` and `pnpm run build` passed.
- Re-split Winuf and Winuf A+ after source check: Winuf remains the existing 3-chamber TPN/o3-o6/market-reference product, while Winuf A+ is the higher-amino-acid/lower-glucose 4th-gen severe-patient product. Existing snippet rows are now `위너프` 8 and `위너프에이플러스` 12, and forced Winuf-to-A+ normalization was removed from snippet/API/client generation paths.
- Hospital/department profile management was removed from the frontend route/nav/storage and AI generation context; live `hospital_profiles` and `department_profiles` are empty.
- Removed `포인트` wording from existing `golden_snippets` rows in the live DB, verified 0 remaining matches, and added frontend/API sanitizers plus snippet-generation prompt rules so future core-ment snippets save with alternate wording such as content/detail/evidence/differentiation.
- Core snippet AI auto-generation now filters generated snippets against both existing library entries and accepted items from the same batch using normalized text similarity before saving, so repeated detail content is skipped client-side.
- Repository relocation from `E:\Sales-Intelligence-Partner` to `E:\Project\Sales-Intelligence-Partner` has been verified. `pnpm install` rebuilt pnpm links after the move, `pnpm run build` passed, and temporary runtime checks returned HTTP 200 from API `/api/healthz` on port 3001 and the Vite app on port 5174.
- Visit-log generation now catches bare `지난번 ...` openings and strips that framing when the sentence does not include a real feedback/result before moving into a new detail.
- When prior context says a product is already in use, same-product `오늘은 ... 중심으로` wording is normalized into usage reaction/reorder/applicable-patient follow-up instead of repeating the product focus.
- Bulk auto-generation now feeds already-created logs from the current batch into later generation and validation calls so same-hospital multi-generate avoids repeated objection/answer/detail phrasing.
- Visit-log normalizer/sanitizer now strips trailing next-visit plan leakage from the visible body, removes product-name spillover from nextStrategy, and admits 플라주OP into the visit-generation context so 마취과/응급의학과 route correctly again.
- Verified the fix with three fresh samples after the patch: 산부인과/페린젝트, 정형외과/위너프에이플러스, and 소화기내과/페린젝트 all came back without the earlier body-leak patterns.
- Broken future fragments such as `확인해보겠을할예정` are now stripped before nextStrategy finalization, while normal memo endings like `디테일함`, `안내드림`, and `확인할예정` remain allowed.
- Raw note product inference now trusts explicit `위너프/페린젝트` mentions before generic Hb/영양 signals, and follow-up finalization now rebuilds generic `실제 처방 여부`-style axes into a different detail line when they repeat the body.
- Visit-log generation now has a shared `finalizeVisitGenerationOutput()` gate used by the pipeline and Visit Log save path, so body text, nextStrategy, and product tags are normalized together after truncation and before persistence.
- The finalizer strips embedded `다음방문...` text from the body, collapses repeated `다음방문시에는`, removes broken future fragments, blocks cross-product leakage, and rebuilds generic nextStrategy axes such as `실제 처방 여부/흐름/적용 사례`.
- External case learning now preserves an anonymized `styleExampleMemo` alongside structured fields, splits multi-product external chunks into separate product patterns, and surfaces anonymized examples in generation context.
- Added pipeline tests for product/body mismatch, body next-visit leakage, broken suffix cleanup, normal ending preservation, external style examples, and repeated `다음방문시에는` regression. Verified `node scripts/test-pipeline.mjs`, `pnpm run typecheck`, and `pnpm run build`.
- Representative finalizer samples for 소화기내과/페린젝트, 정형외과/페린젝트, 정형외과/위너프에이플러스, 산부인과/페린젝트, 외과/위너프에이플러스, and 마취통증의학과/플라주OP all passed without product leakage, repeated next-visit markers, or broken future suffixes.
- Visit-log generation now has a shared department profile gate for oncology, pulmonology, neurosurgery, orthopedics, OB/GYN, ICU, gastroenterology, colorectal surgery, HPB surgery, and gastric surgery. Planner candidates, validator mismatch checks, finalizer cleanup, and repair fallback now use the same department-patient context.
- Finalizer now removes professor/hospital/department prefixes such as `종양내과 이종인 교수님`, blocks malformed product-reaction starts like `위너프에이플러스의 교수님께서`, rewrites generic next strategies, and falls back to department-safe product text before save.
- Pipeline validation failures no longer pass through as AI output. The repair loop is restored with `validate_repair`, final validation, and hard fallback, while external-case style examples now preserve anonymized `교수님께서...` memo structure.
- Regression checks were added for 이종인/종양내과 prefix removal, 호흡기내과 산후 mismatch, 종양내과 암/항암 context, 신경외과 fallback, repair fallback, and planner/pipeline static guardrails.
- Empty or too-short AI outputs now route through deterministic department fallback instead of being saved as fragments or shown as `결과 없음`. The bulk UI no longer short-circuits before finalizer fallback, and the pipeline catches generation errors with hard fallback.
- A regression case now checks `최성진/산부인과` with a fragment like `수술 후에도 가능하냐고 확인하심.` and verifies that the saved output uses 산후/부인과 페린젝트 context, not 정형외과 context.

## Useful Entry Points
- `package.json`
- `artifacts/api-server/src/index.ts`
- `artifacts/api-server/src/app.ts`
- `artifacts/sales-intelligence/src/App.tsx`
