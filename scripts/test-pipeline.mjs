import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const externalCasesPath = path.join(root, 'artifacts/sales-intelligence/src/lib/externalCases.ts');
const detailKeysPath = path.join(root, 'artifacts/sales-intelligence/src/lib/visit-generation/detailKeys.ts');
const normalizerPath = path.join(root, 'artifacts/sales-intelligence/src/lib/visit-generation/normalizer.ts');
const validatorPath = path.join(root, 'artifacts/sales-intelligence/src/lib/visit-generation/validator.ts');
const repairPath = path.join(root, 'artifacts/sales-intelligence/src/lib/visit-generation/repair.ts');
const plannerPath = path.join(root, 'artifacts/sales-intelligence/src/lib/visit-generation/planner.ts');
const pipelinePath = path.join(root, 'artifacts/sales-intelligence/src/lib/visit-generation/pipeline.ts');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function importTsModule(filePath, moduleName) {
  const source = await readFile(filePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const dir = path.join(tmpdir(), `sip-pipeline-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  const outFile = path.join(dir, moduleName);
  await writeFile(outFile, output, 'utf8');
  return {
    module: await import(`file:///${outFile.replace(/\\/g, '/')}`),
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

async function importVisitGenerationCjs(entryFile) {
  const dir = path.join(tmpdir(), `sip-pipeline-cjs-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  for (const [sourcePath, moduleName] of [
    [detailKeysPath, 'detailKeys.js'],
    [normalizerPath, 'normalizer.js'],
    [validatorPath, 'validator.js'],
    [repairPath, 'repair.js'],
  ]) {
    const source = await readFile(sourcePath, 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText;
    await writeFile(path.join(dir, moduleName), output, 'utf8');
  }
  const require = createRequire(import.meta.url);
  return {
    module: require(path.join(dir, entryFile)),
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

const imported = await importTsModule(detailKeysPath, 'detailKeys.mjs');
let extractReactionKeysForTest;
try {
  const { extractKeys, similarityRatio, normalizeTerminology, extractReactionKeys, collectReactionKeys } = imported.module;
  extractReactionKeysForTest = extractReactionKeys;

  const today = '페린젝트의 1회 투여 편의성과 경구용철분제 반응이 더딘 케이스 중심으로 디테일 진행함';
  const next = '다음방문시에는 경구용철분제 반응이 늦는 케이스 중심으로 페린젝트 처방 상황 확인할예정';
  const winuf = '위너프에이플러스의 아미노산 25% 증가와 포도당 부담 감소를 중증 수술 환자 중심으로 디테일 진행함';
  const reactionA = '교수님께서 반복 내원이 어려운 환자에서는 설명해볼 수 있겠다는 반응 보임';
  const reactionB = '교수님께서 재방문 부담이 있는 환자에서는 고려 가능하다는 의견 보임';
  const reactionC = '교수님께서 외래 재방문이 어려운 환자에서는 편의성은 인정하셨음';
  const reactionD = '교수님께서 외래 추적이 어려운 환자에서는 편의성은 이해하셨음';
  const reactionE = '교수님께서 경구용철분제 복용 지속이 어려운 환자에서 검토 가능하다는 의견 보임';

  assert(
    extractReactionKeys(reactionA).includes('반복내원재방문부담'),
    '반복 내원 어려움 반응은 반복내원재방문부담 키로 잡혀야 합니다'
  );
  assert(
    collectReactionKeys([reactionA, reactionB, reactionC, reactionD, reactionE]).length === 1,
    '반복 내원, 재방문 부담, 외래 재방문 불편, 외래 추적 어려움, 복용 지속 어려움은 같은 교수 반응으로 묶여야 합니다'
  );

  assert(
    extractKeys(today).includes('경구용철분제반응부족'),
    '경구용철분제 반응 부족 의미 키를 추출해야 합니다.'
  );
  assert(
    similarityRatio(today, next) >= 0.4,
    '더딘 케이스와 늦는 케이스는 같은 의미 중복으로 잡혀야 합니다.'
  );
  assert(
    similarityRatio(today, winuf) < 0.4,
    '다른 제품/다른 디테일 축은 중복으로 잡히면 안 됩니다.'
  );
  assert(
    normalizeTerminology('경구용철분제제제 반응 확인') === '경구용철분제 반응 확인',
    '경구용철분제제제는 경구용철분제로 정규화되어야 합니다.'
  );
} finally {
  await imported.cleanup();
}

const externalCases = await importTsModule(externalCasesPath, 'externalCases.mjs');
try {
  const { extractExternalCasePatternsFromText, buildExternalCasePromptInput } = externalCases.module;
  const sample = await readFile(path.join(root, '외부참고사항.txt'), 'utf8');
  const patterns = extractExternalCasePatternsFromText(sample);
  assert(patterns.length >= 12, '외부참고사항 샘플에서 의미 있는 외부 사례 패턴을 충분히 추출해야 합니다.');
  assert(
    patterns.some((p) => p.department === '종양내과' && p.product === '페린젝트' && /경구용철분제|GI|흡수/.test(`${p.patientGroup} ${p.detailAxis}`)),
    '종양내과 페린젝트 암환자/경구용철분제 한계 패턴을 추출해야 합니다.'
  );
  assert(
    patterns.some((p) => p.department === '산부인과' && p.product === '페린젝트' && /산후|부인과|철결핍|수술/.test(p.patientGroup)),
    'HER 캠페인 같은 표현은 산부인과 빈혈 환자 패턴으로 변환되어야 합니다.'
  );
  assert(
    patterns.some((p) => p.product === '위너프에이플러스' && /영양|고단백|아미노산/.test(`${p.patientGroup} ${p.detailAxis}`)),
    '위너프 계열 참고사항은 위너프에이플러스 영양 디테일 패턴으로 정규화되어야 합니다.'
  );
  const promptInput = buildExternalCasePromptInput(sample);
  assert(!/^\s*1\.\s*1\./m.test(promptInput), '전처리 후보에는 의미 없는 중첩 번호가 남으면 안 됩니다.');
  assert(!/백만/.test(promptInput), '전처리 후보에는 내정가/금액 노이즈가 남으면 안 됩니다.');
} finally {
  await externalCases.cleanup();
}

const normalizer = await importVisitGenerationCjs('normalizer.js');
try {
  const { normalize } = normalizer.module;
  const result = normalize(
    {
      formattedLog: '페린젝트의 페린젝트의 1회 투여 편의성과 Hb 회복 근거를 디테일 진행함. 교수님께서 재방문 부담이 있는 환자에서는 고려 가능하다는 의견 보임',
      nextStrategy: '다음방문시에는 페린젝트의 페린젝트의 급여 기준에 맞는 외래 빈혈 케이스 확인',
    },
    { product: '페린젝트' }
  );
  assert(!result.formattedLog.includes('페린젝트의 페린젝트의'), '본문의 제품명 반복 접두는 제거되어야 합니다.');
  assert(!result.nextStrategy.includes('페린젝트의 페린젝트의'), '다음방문전략의 제품명 반복 접두는 제거되어야 합니다.');
  const particleResult = normalize(
    {
      formattedLog: '페린젝트의의 1회 투여 편의성과 Hb 회복 근거를 디테일 진행함. 교수님께서 재방문 부담이 있는 환자에서는 고려 가능하다는 의견 보임',
      nextStrategy: '다음방문시에는 페린젝트의의 급여 기준 확인',
    },
    { product: '페린젝트' }
  );
  assert(!particleResult.formattedLog.includes('페린젝트의의'), '본문의 중복 조사는 제거되어야 합니다.');
  assert(!particleResult.nextStrategy.includes('페린젝트의의'), '다음방문전략의 중복 조사는 제거되어야 합니다.');
  const grammarResult = normalize(
    {
      formattedLog: '페린젝트의 1회 투여 편의성과 Hb 회복 근거을 디테일 진행함. 교수님께서 반복 내원이 어려운 환자에서는 설명해볼 수 있겠다는 반응하셨고',
      nextStrategy: '위너프에이플러스 수술 후 식이 지연 환자 영양 보충 반응 확인',
    },
    { product: '페린젝트' }
  );
  assert(!grammarResult.formattedLog.includes('근거을'), '근거을은 근거를로 정리되어야 합니다.');
  assert(!grammarResult.formattedLog.includes('반응하셨고'), '반응하셨고는 저장 전 자연스러운 표현으로 정리되어야 합니다.');
} finally {
  await normalizer.cleanup();
}

const validator = await importVisitGenerationCjs('validator.js');
try {
  const { validate } = validator.module;
  const plan = {
    product: '페린젝트',
    patientGroup: '위장관 출혈 이후 경구용철분제로 Hb 회복이 더딘 소화기내과 외래 빈혈 환자',
    detailAxis: '페린젝트의 1회 투여 편의성과 Hb 회복 근거',
    doctorReaction: '재방문 부담이 있는 환자에서는 고려 가능하다는 반응',
    nextAction: '위너프에이플러스 IBD 악화 환자의 영양 보충 필요성 확인',
    narrativeStyle: '환자 케이스 연결형',
    selectionReason: 'test',
  };
  const ctx = {
    doctor: { department: '소화기내과' },
    batchAvoidTexts: [],
    batchUsedReactionKeys: [],
    pastLogs: [],
  };
  const bad = validate(
    '페린젝트의 1회 투여 편의성을 분만 후 외래 재방문이 어려운 환자 상황과 연결해 디테일 진행함. 교수님께서 편의성은 공감하셨고 급여 기준은 확인해보겠다는 의견 보임',
    '다음방문시에는 위너프에이플러스 IBD 악화 환자의 영양 보충 필요성 확인할예정',
    plan,
    ctx
  );
  assert(!bad.pass && bad.failTypes.includes('DEPARTMENT_MISMATCH'), '소화기내과에 분만/산후 맥락이 나오면 실패해야 합니다.');

  const good = validate(
    '페린젝트의 1회 투여 편의성과 Hb 회복 근거를 위장관 출혈 이후 경구용철분제로 회복이 더딘 외래 빈혈 환자 상황과 연결해 디테일 진행함. 교수님께서 재방문 부담이 있는 환자에서는 고려 가능하다는 반응 보임',
    '다음방문시에는 위너프에이플러스 IBD 악화 환자의 영양 보충 필요성 확인할예정',
    plan,
    ctx
  );
  assert(good.pass || !good.failTypes.includes('DEPARTMENT_MISMATCH'), '소화기내과 허용 맥락은 진료과 불일치로 실패하면 안 됩니다.');

  const duplicateReaction = validate(
    '페린젝트의 1회 투여 편의성과 Hb 회복 근거를 위장관 출혈 이후 경구용철분제로 Hb 회복이 더딘 소화기내과 외래 빈혈 환자 상황과 연결해 디테일 진행함. 교수님께서 재방문 부담이 있는 환자에서는 고려 가능하다는 의견 보임',
    '다음방문시에는 위너프에이플러스 IBD 악화 환자의 영양 보충 필요성 확인할예정',
    plan,
    { ...ctx, batchUsedReactionKeys: ['반복내원재방문부담'] }
  );
  assert(
    !duplicateReaction.pass && duplicateReaction.failTypes.includes('DUPLICATE_REACTION'),
    'batch 안에서 같은 의미의 교수 반응이 반복되면 DUPLICATE_REACTION으로 실패해야 합니다.'
  );
  const learnedForbiddenShortAnchor = validate(
    '페린젝트의 1회 투여 편의성과 Hb 회복 근거를 위장관 출혈 이후 외래 빈혈 환자 상황에 맞춰 설명함. 교수님께서 급여 기준에 맞는 케이스부터 차트로 확인해보겠다는 의견 보임',
    '다음방문시에는 위너프에이플러스 IBD 악화 환자 영양 보충 필요성 확인할예정',
    { ...plan, product: '페린젝트', detailAxis: '페린젝트의 1회 투여 편의성과 Hb 회복 근거' },
    {
      ...ctx,
      doctor: { department: '소화기내과' },
      learnedForbiddenPatterns: ['페린젝트의 1회 투여 편의성과 Hb 회복 근거를 경구용철분제로 Hb 회복이 충분하지 않은 외래 빈혈 환자 상황과 연결해 디테일 진행함'],
    }
  );
  assert(
    !learnedForbiddenShortAnchor.failTypes?.includes('LEARNED_FORBIDDEN'),
    '학습 금지는 앞부분 일부만 겹친 정상 문장을 막으면 안 됩니다.'
  );
} finally {
  await validator.cleanup();
}

const repairer = await importVisitGenerationCjs('repair.js');
try {
  const { buildFallback } = repairer.module;
  const plan = {
    product: '페린젝트',
    patientGroup: '경구용철분제로 Hb 회복이 충분하지 않은 외래 빈혈 환자',
    detailAxis: '페린젝트의 1회 투여 편의성과 Hb 회복 근거',
    doctorReaction: '반복 내원이 어려운 환자에서는 설명해볼 수 있겠다는 반응',
    nextAction: '위너프에이플러스 수술 후 식이 지연 환자 영양 보충 반응 확인',
    narrativeStyle: '처방 경험 확인형',
    selectionReason: 'test',
  };
  const ctx = {
    doctor: { department: '소화기내과' },
    batchUsedReactionKeys: ['반복내원재방문부담'],
    learnedPreferredPatterns: [],
  };
  const repaired = buildFallback(plan, ctx);
  assert(
    !extractReactionKeysForTest(repaired.formattedLog).includes('반복내원재방문부담'),
    'repair fallback은 이미 사용된 반복내원재방문부담 반응을 다시 쓰면 안 됩니다.'
  );
} finally {
  await repairer.cleanup();
}

const plannerSource = await readFile(plannerPath, 'utf8');
const pipelineSource = await readFile(pipelinePath, 'utf8');
const aiSource = await readFile(path.join(root, 'artifacts/sales-intelligence/src/lib/ai.ts'), 'utf8');
const storageSource = await readFile(path.join(root, 'artifacts/sales-intelligence/src/lib/storage.ts'), 'utf8');
const dataRouteSource = await readFile(path.join(root, 'artifacts/api-server/src/routes/data.ts'), 'utf8');
const contextSource = await readFile(path.join(root, 'artifacts/sales-intelligence/src/lib/visit-generation/context.ts'), 'utf8');
const externalCasesPageSource = await readFile(path.join(root, 'artifacts/sales-intelligence/src/pages/ExternalCasesPage.tsx'), 'utf8');
assert(
  plannerSource.includes('hasDailyObFerinject') && plannerSource.includes('산부인과 페린젝트'),
  'planner는 하루 1건 산부인과 페린젝트 보장 규칙을 포함해야 합니다.'
);
assert(
  plannerSource.includes('narrativeStyle') && plannerSource.includes('professorQuestion'),
  'planner는 전개 방식과 교수 질문 후보를 계획에 포함해야 합니다.'
);
assert(
  pipelineSource.includes('context') &&
    pipelineSource.includes('plan') &&
    pipelineSource.includes('generate') &&
    pipelineSource.includes('normalize') &&
    pipelineSource.includes('validate_') &&
    pipelineSource.includes('repair_'),
  'pipeline은 context -> plan -> generate -> normalize -> validate/repair 단계를 trace해야 합니다.'
);
assert(
  pipelineSource.includes('validate_final') && pipelineSource.includes('hard_fallback') && pipelineSource.includes('failed final validation'),
  'pipeline은 repair 이후 최종 검증과 hard fallback 실패 차단을 포함해야 합니다.'
);
assert(
  pipelineSource.includes("'LEARNED_FORBIDDEN'"),
  'LEARNED_FORBIDDEN 단독 잔여 실패는 생성 자체를 막지 않는 non-blocking fallback 대상이어야 합니다.'
);
assert(
  !/실제 적용 환자군|적용 가능 환자군/.test(aiSource + plannerSource),
  '생성 프롬프트와 planner 후보에는 금지된 환자군 표현이 남아 있으면 안 됩니다.'
);
assert(
  aiSource.includes("const VISIT_LOG_MODEL = 'gpt-5.4-mini'"),
  '방문일지 생성 전용 모델은 gpt-5.4-mini여야 합니다.'
);
assert(
  aiSource.includes('const VISIT_LOG_MAX_COMPLETION_TOKENS = 800') &&
    aiSource.includes('const DEFAULT_MAX_COMPLETION_TOKENS = 1000'),
  '방문일지 전용 max tokens와 기본 max tokens는 각각 800, 1000이어야 합니다.'
);
assert(
  aiSource.includes('manual: { title: string; content: string }') && aiSource.includes('detectKey(m) === productName'),
  '제품별 핵심멘트 생성은 제목뿐 아니라 제품정보 본문까지 보고 대상 자료를 골라야 합니다.'
);
assert(
  storageSource.includes('sharedKeys.length >= 2') && dataRouteSource.includes('sharedKeys.length >= 2'),
  '핵심멘트 중복 판정은 의미 키 1개만 겹친다고 즉시 중복 처리하면 안 됩니다.'
);
assert(
  aiSource.includes('coverageLine') &&
    aiSource.includes('전체 후보') &&
    aiSource.includes('강릉아산과 원주세브란스 양쪽 교수들을 모두 자동생성 후보로 같이 고려'),
  '분석과 자동생성은 같은 진료과가 여러 병원에 있으면 양쪽을 모두 후보로 봐야 합니다.'
);
assert(
  aiSource.includes('analyzeExternalCasePatterns') &&
    aiSource.includes('문장 복사 금지') &&
    aiSource.includes('햅시딘 상승과 경구용철분제 흡수 저하'),
  '외부 사례 분석은 원문 복사가 아니라 종양내과/페린젝트 의미 패턴 추출을 포함해야 합니다.'
);
assert(
  contextSource.includes('externalCasePatternStorage.getForGeneration') &&
    contextSource.includes('manualRawNotes') &&
    contextSource.includes('externalCasePatterns'),
  'context 단계는 자동생성에서만 외부 사례 패턴을 읽고 메모편집 원문을 덮어쓰면 안 됩니다.'
);
assert(
  plannerSource.includes('externalCandidates') &&
    plannerSource.includes('externalPatternBonus') &&
    plannerSource.includes('confidence'),
  'planner는 외부 사례 후보와 confidence 보너스를 생성 후보 평가에 반영해야 합니다.'
);
assert(
  storageSource.includes('externalCasePatternStorage') &&
    storageSource.includes('isSimilarExternalCase') &&
    dataRouteSource.includes('/external-case-patterns'),
  '외부 사례 패턴은 storage/API에 저장되고 의미 중복 저장을 막아야 합니다.'
);
assert(
  externalCasesPageSource.includes('외부 사례 학습') &&
    externalCasesPageSource.includes('분석하기') &&
    externalCasesPageSource.includes('원문은 저장하지 않습니다'),
  '외부 사례 학습 페이지는 붙여넣기 분석과 원문 미저장 안내를 제공해야 합니다.'
);

console.log('pipeline cases passed');
