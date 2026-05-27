import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const detailKeysPath = path.join(root, 'artifacts/sales-intelligence/src/lib/visit-generation/detailKeys.ts');
const plannerPath = path.join(root, 'artifacts/sales-intelligence/src/lib/visit-generation/planner.ts');
const pipelinePath = path.join(root, 'artifacts/sales-intelligence/src/lib/visit-generation/pipeline.ts');
const repairPath = path.join(root, 'artifacts/sales-intelligence/src/lib/visit-generation/repair.ts');
const visitLogPagePath = path.join(root, 'artifacts/sales-intelligence/src/pages/VisitLogPage.tsx');

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

const imported = await importTsModule(detailKeysPath, 'detailKeys.mjs');
try {
  const { extractKeys, similarityRatio, normalizeTerminology } = imported.module;

  const today = '페린젝트의 1회 투여 편의성과 경구용철분제 반응이 더딘 케이스 중심으로 디테일 진행함';
  const next = '다음방문시에는 경구용철분제 반응이 늦는 케이스 중심으로 페린젝트 처방 상황 확인할예정';
  const winuf = '위너프에이플러스의 아미노산 25% 증가와 포도당 부담 감소를 중증 수술 환자 중심으로 디테일 진행함';
  const screenshotOne = '위너프에이플러스의 중증 환자 영양에서 아미노산 25% 증가와 포도당 부담 감소 차별점을 중환자 영양 공급 흐름과 연결해 디테일 진행함';
  const screenshotTwo = '위너프에이플러스의 고아미노산 저포도당 조성으로 중증 환자 영양 부담을 줄이는 차별점을 중환자 영양 공급 흐름과 연결해 디테일 진행함';
  const screenshotThree = '위너프에이플러스의 중증 환자 영양에서 아미노산 25% 증가와 포도당 부담 감소 차별점을 중환자 영양 공급 흐름과 연결해 디테일 진행함';

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
  assert(
    similarityRatio(screenshotOne, screenshotTwo) >= 0.4 &&
      similarityRatio(screenshotOne, screenshotThree) >= 0.4,
    '스크린샷처럼 같은 위너프 중증영양 흐름은 배치 중복으로 잡혀야 합니다.'
  );
} finally {
  await imported.cleanup();
}

const plannerSource = await readFile(plannerPath, 'utf8');
const pipelineSource = await readFile(pipelinePath, 'utf8');
const repairSource = await readFile(repairPath, 'utf8');
const aiSource = await readFile(path.join(root, 'artifacts/sales-intelligence/src/lib/ai.ts'), 'utf8');
const visitLogPageSource = await readFile(visitLogPagePath, 'utf8');
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
  !/실제 적용 환자군|적용 가능 환자군/.test(aiSource + plannerSource),
  '생성 프롬프트와 planner 후보에는 금지된 환자군 표현이 남아 있으면 안 됩니다.'
);
assert(
  aiSource.includes("const VISIT_LOG_MODEL = 'gpt-5.5'"),
  '방문일지 생성 전용 모델은 gpt-5.5여야 합니다.'
);
assert(
  plannerSource.includes('findAlternativePlan') &&
    plannerSource.includes('외과 병동에서 수술 후 금식이 길어지는 환자') &&
    plannerSource.includes('신경외과 수술 후 의식 회복 지연') &&
    plannerSource.includes('산부인과 수술 후 오심'),
  'planner는 외과/신경외과/산부인과별로 서로 다른 위너프 후보를 가져야 합니다.'
);
assert(
  repairSource.includes('findAlternativePlan') &&
    repairSource.includes('buildNonConflictingFallback') &&
    !repairSource.includes('다음 처방은 진료 흐름에 맞춰 선별해 보겠다는 의견 보임'),
  'repair는 중복 실패를 고정 fallback 문장으로 덮지 말고 대체 계획을 사용해야 합니다.'
);
assert(
  aiSource.includes('buildVisitCandidatePool') &&
    aiSource.includes('pickVisitCandidate') &&
    aiSource.includes('buildFallbackVisitLog(finalAllowedProducts[0] ||') &&
    aiSource.includes('avoidTexts'),
  'ai 최종 보정은 진료과/기사용 디테일 기반 후보와 avoidTexts를 사용해야 합니다.'
);
assert(
  visitLogPageSource.includes('todayScopeAvoidTexts') &&
    visitLogPageSource.includes('...todayScopeAvoidTexts'),
  '일괄 자동생성은 오늘 같은 화면에서 만든 메모변환 결과도 중복 회피 대상으로 넣어야 합니다.'
);

console.log('pipeline cases passed');
