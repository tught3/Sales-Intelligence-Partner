import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const storageSource = await readFile(path.join(root, 'artifacts/sales-intelligence/src/lib/storage.ts'), 'utf8');
const historySource = await readFile(path.join(root, 'artifacts/sales-intelligence/src/pages/VisitLogHistoryPage.tsx'), 'utf8');
const contextSource = await readFile(path.join(root, 'artifacts/sales-intelligence/src/lib/visit-generation/context.ts'), 'utf8');
const validatorSource = await readFile(path.join(root, 'artifacts/sales-intelligence/src/lib/visit-generation/validator.ts'), 'utf8');
const repairSource = await readFile(path.join(root, 'artifacts/sales-intelligence/src/lib/visit-generation/repair.ts'), 'utf8');
const aiSource = await readFile(path.join(root, 'artifacts/sales-intelligence/src/lib/ai.ts'), 'utf8');
const apiSource = await readFile(path.join(root, 'artifacts/api-server/src/routes/data.ts'), 'utf8');
const schemaSource = await readFile(path.join(root, 'lib/db/src/schema/index.ts'), 'utf8');

assert(schemaSource.includes('visitLogFeedbackEvents'), 'DB schema must define visitLogFeedbackEvents.');
assert(schemaSource.includes('aiGenerationPreferences'), 'DB schema must define aiGenerationPreferences.');
assert(apiSource.includes('/visit-log-feedback-events'), 'API must expose feedback event endpoints.');
assert(apiSource.includes('/ai-generation-preferences'), 'API must expose preference endpoints.');
assert(storageSource.includes('feedbackStorage') && storageSource.includes('preferenceStorage'), 'storage must expose feedback/preference stores.');
assert(storageSource.includes('rebuildPreferencesFromEvents'), 'storage must rebuild preferences from feedback events.');
assert(historySource.includes("eventType: 'edit'"), 'editing a visit log must record an edit feedback event.');
assert(historySource.includes("eventType: 'delete'"), 'deleting a visit log must record a delete feedback event.');
assert(contextSource.includes('preferenceStorage.getForGeneration'), 'visit-generation context must load learning preferences.');
assert(validatorSource.includes('LEARNED_FORBIDDEN'), 'validator must block learned forbidden patterns.');
assert(validatorSource.includes('MANUAL_FACT_CHANGED'), 'validator must block manual memo fact replacement.');
assert(repairSource.includes('buildManualPreservingFallback'), 'repair must preserve manual memo facts.');
assert(aiSource.includes('buildLearningPreferenceNote'), 'AI prompts must include learning preference context.');
assert(aiSource.includes('원본 메모의 내용') && aiSource.includes('다른 제품/다른 디테일로 대체 금지'), 'manual memo prompt must forbid replacing user facts.');

console.log('learning cases passed');
