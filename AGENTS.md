<!-- [WIKI:START] Personal Wiki Reference - 직접 수정 금지 -->
<!-- 작업 경로: E:\Project\Sales-Intelligence-Partner -->
<!-- 생성: 2026-05-20 21:40 -->

# Codex Common Rules
<!-- 프로젝트 공통 Codex 작업 규칙 -->

## 기본 원칙
- 기본 응답 언어는 한국어다.
- 여기에 남길 규칙은 둘 이상의 프로젝트군에서 재사용되는 것만 둔다.
- 하나의 프로젝트나 도메인에만 해당하는 규칙은 여기로 올리지 말고 해당 문서로 내린다.
- 세션 시작 시 `.planning/STATE.md`, `.planning/context/ACTIVE_SUMMARY.md`, `node scripts/gsd-context-hygiene.mjs`를 확인한다.
- 작업 전에 현재 컨텍스트를 압축하고, 완료 전에는 검증과 푸시까지 마친다.

## 모델 라우팅과 병렬 처리
- 비단순 작업은 계획 -> 병렬 작업자 -> 별도 리뷰어 -> 수정 -> 재리뷰 순서로 진행한다.
- 계획 단계는 `gpt-5.5`를 우선한다.
- 일반 구현은 `gpt-5.3-codex-spark`를 우선한다.
- 난도가 높은 구현과 리뷰어 검토는 `gpt-5.4-mini`를 우선한다.
- 계획이 끝나면 실제 작업은 가능한 한 무조건 병렬로 진행한다.
- 파일, 모듈, 서브시스템이 겹치지 않으면 워커를 동시에 띄우고 병렬 완료를 우선한다.
- 병렬 작업 후 더 이상 필요 없는 서브에이전트는 즉시 닫고, 띄워둔 채로 방치하지 않는다.

## 작업 방식
- 기존 코드, 기존 문서, 기존 구조를 먼저 확인한다.
- 범위는 사용자 요청에 맞게 좁게 유지한다.
- 관련 없는 파일을 수정하거나 삭제하지 않는다.
- 사용자가 만든 변경은 되돌리지 않는다.
- 새 구조는 정말 필요할 때만 만든다.
- 공통 규칙과 프로젝트 규칙이 충돌하면 프로젝트 문서를 우선한다.
- 프로젝트별 세부 규칙은 해당 프로젝트 문서에서 확인한다.

## 검증과 마무리
- 변경 후에는 재생성 스크립트와 검증 스크립트를 다시 돌린다.
- 완료 보고 전에는 커밋과 푸시 상태를 확인한다.
- 결과를 설명할 때는 무엇을 바꿨는지, 무엇을 검증했는지, 남은 위험이 있는지를 분리해서 말한다.


## 프로젝트에서 반복 확인된 공통 규칙
<!-- [AUTO-COMMON:START] -->
- (새로 승격할 공통 규칙 없음)
<!-- [AUTO-COMMON:END] -->


# AI Behavior Rules
<!-- AI가 작업 시 반드시 따라야 할 행동 원칙. 모든 프로젝트에 공통 적용. -->

## 절대 금지
- 계획 없이 코드 먼저 작성
- 기존 동작 중인 코드를 이유 없이 리팩토링
- 승인 없이 아키텍처 변경
- 가격/구독 정책 임의 변경
- iOS 관련 코드 추가 (Android-only 프로젝트)
- 검증 없이 완료 보고
- 컨텍스트 압축 없이 작업 시작

## 필수 행동
- 작업 전: 컨텍스트 압축 -> 계획 제시 -> 승인 대기
- 작업 중: 계획 외 변경 발생 시 즉시 보고
- 작업 후: push -> 빌드 -> 실행 -> 테스트 순서로 검증
- 모르면 가정하지 말고 질문
- 난이도와 모델이 맞지 않으면 모델 변경 후 진행

## 응답 원칙
- 한국어로 응답
- 코드 변경 시 변경 전/후 명시
- 영향 범위 항상 명시 (어느 파일, 어느 기능)
- 에러 발생 시 원인 -> 해결책 -> 예방법 순서로 설명

# Anti-Patterns
<!-- 이미 실패했거나 기각된 접근법. AI에게 다시 제안하지 말 것. -->

## 전역 금지 패턴

### 상태관리
- Flutter에서 Provider 사용 -> Riverpod 사용
- React에서 Redux -> Zustand 사용

### 아키텍처
- React Native (Flutter 전환 완료, 롤백 금지)
- Firebase (Supabase로 확정, 변경 금지)
- iOS 빌드 시도 (SMS/알림 API 접근 불가)

### 코드 품질
- any 타입 남발
- useEffect 안에 직접 fetch 호출
- 하드코딩된 API 키/비밀값

## 프로젝트별 anti-patterns
-> 각 02_PROJECTS/[프로젝트].md 파일의 금지 패턴 섹션 참조

# Sales Intelligence Partner

## 경로
E:\Project\Sales-Intelligence-Partner

## 목적
제약영업 AI 인텔리전스 도구 - 거래처 분석, 영업 전략 수립 보조
병원별 영업 전략, 경쟁사 분석, 처방 패턴 인사이트 제공

## 기술스택
- Frontend: React + TypeScript + Tailwind CSS
- Backend: Python (FastAPI)
- AI: GPT-4o / GPT-4o-mini (분석 복잡도에 따라 선택)
- DB: SQLite (로컬) + 선택적 Supabase (비민감 데이터만)
- 데이터: Hospital Performance DB 연동

## 주요 기능
- 거래처별 영업 전략 AI 제안
- 병원 처방 패턴 분석 및 기회 발굴
- 경쟁 제품 대비 포지셔닝 분석
- 월간 영업 리포트 자동 생성
- 다음 방문 준비 AI 브리핑 (거래처별 맞춤)
- 영업 성과 예측 모델

## 아키텍처
- Hospital Performance DB 데이터 읽기 (단방향)
- GPT-4o-mini로 일상 분석, GPT-4o로 복잡한 전략 수립
- 비민감 집계 데이터만 AI API 전달
- 개인 식별 정보 제거 후 분석

## AI 작업 시 주의점
- 거래처 매출 원본 데이터 외부 API 전송 금지
- 집계/익명화된 데이터만 AI 분석에 사용
- Hospital Performance와 데이터 중복 저장 금지 (단방향 읽기)
- 처방 데이터는 집계 형태로만 AI에 전달

## 금지 패턴
- 거래처 원본 데이터 클라우드 동기화
- Hospital Performance DB 직접 수정
- 의사 개인정보 AI API 전송

## AGENTS (Project)
- `artifacts/api-server`, `artifacts/sales-intelligence`, `lib/db` 구조를 유지한다.
- 검증/배포 흐름은 빌드, 런타임 확인, `pnpm run build`, `pnpm run check`, 필요 시 재현 데이터 검증 순서를 따른다.


<!-- [WIKI:END] -->

# AGENTS.md for `E:\Project\Sales-Intelligence-Partner`

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
- QMD first for documentation/knowledge lookup when applicable.
- Financial pipeline source of truth is `financial_raw_archive`.
- Parser/storage changes must run the financial regression before completion.
- Keep review/verification strict: no completion report until the requested items are all satisfied.
- Path context: stay rooted at `E:\Project\Sales-Intelligence-Partner` unless a task explicitly says otherwise.
- If planning needs real phone records from the financial app, request ADB connection first, verify the device is connected, and inspect the device with ADB before finalizing the plan or code changes.

## 🧠 Karpathy 코딩 원칙 (LLM 실수 방지)

> 출처: [andrej-karpathy-skills](https://github.com/forrestchang/andrej-karpathy-skills)

1. **코딩 전 사고**: 가정을 명시적으로 서술, 불확실하면 질문. 침묵 속 결정 금지.
2. **단순성 우선**: 요청된 것만 구현. 200줄이 50줄 가능하면 다시 작성. 추측성 기능 추가 금지.
3. **수술적 변경**: 필요한 것만 수정, 기존 스타일 유지. 불필요해진 것만 제거.
4. **목표 기반 실행**: 검증 가능한 성공 기준 설정 후 시작. 단계별 체크포인트 생성.

## 프로젝트 구조 (Sales Intelligence Partner)

```
artifacts/
├── api-server/          # Express API (포트 3001)
│   └── src/routes/
│       ├── ai.ts        # Claude AI 프록시
│       └── data.ts      # CRUD API
└── sales-intelligence/  # React 프론트엔드 (포트 5000)
    └── src/lib/
        ├── storage.ts   # API 클라이언트 + 캐시 (API_BASE 여기서 export)
        └── ai.ts        # AI 통합 (API_BASE를 storage.ts에서 import)
lib/
└── db/                  # Drizzle ORM + 스키마
```

## 배포 구조

- **Vercel** (프론트): `vercel.json`에서 `/api/*` → Railway로 rewrite
- **Railway** (백엔드): Express API + PostgreSQL

## Detail references
- Workflow details: `docs/agent-rules-workflow.md`
- Validation details: `docs/agent-rules-validation.md`
- Operations details: `docs/agent-rules-operations.md`
