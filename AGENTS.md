<!-- [WIKI:START] Personal Wiki Reference - 직접 수정 금지 -->
<!-- 작업 경로: E:\Project\Sales-Intelligence-Partner -->
<!-- 생성: 2026-05-24 09:51 -->

# Codex Common Rules
<!-- 프로젝트 공통 Codex 작업 규칙 -->

## 기본 원칙
- 기본 응답 언어는 한국어다.
- 여기에 남길 규칙은 둘 이상의 프로젝트군에서 재사용되는 것만 둔다.
- 하나의 프로젝트나 도메인에만 해당하는 규칙은 여기로 올리지 말고 해당 문서로 내린다.
- 세션 시작 시 `.planning/STATE.md`, `.planning/context/ACTIVE_SUMMARY.md`, `node scripts/gsd-context-hygiene.mjs`를 확인한다.
- 모든 작업을 진행하기 이전에 이전 대화 기록과 현재 작업 맥락을 먼저 컨텍스트 압축한 뒤 진행한다.
- 한글 중심 작업 환경이므로 모든 파일 읽기/쓰기는 UTF-8을 기준으로 처리하고, 한글이 깨지지 않게 확인한다.

## 모델 라우팅과 병렬 처리
- 비단순 작업은 계획 -> 병렬 작업자 -> 별도 리뷰어 -> 수정 -> 재리뷰 순서로 진행한다.
- 계획 단계는 `gpt-5.5`를 우선한다.
- 일반 구현은 `gpt-5.3-codex-spark`를 우선한다.
- 난도가 높은 구현과 리뷰어 검토는 `gpt-5.4-mini`를 우선한다.
- 계획이 끝나면 실제 작업은 가능한 한 무조건 병렬로 진행한다.
- 파일, 모듈, 서브시스템이 겹치지 않으면 워커를 동시에 띄우고 병렬 완료를 우선한다.
- 병렬 작업 후 자기 할 일이 끝난 서브에이전트는 즉시 닫는다.
- 완료된 서브에이전트를 띄워둔 채로 방치하지 않고, 다음 병렬 작업에 자원을 바로 쓸 수 있게 한다.

## 작업 방식
- 기존 코드, 기존 문서, 기존 구조를 먼저 확인한다.
- 새 기능, 화면, 컴포넌트, UI 요소를 추가하기 전에는 반드시 기존 디자인 스타일, CSS, 테마, 토큰, 공용 컴포넌트, 레이아웃 패턴이 있는지 먼저 확인한다.
- 새 UI는 프로젝트가 이미 쓰는 스타일과 시각 언어에 맞춰 통일해서 개발하고, 기본 브라우저/프레임워크 스타일을 그대로 덧붙이지 않는다.
- 버튼, 카드, 입력창, 모달, 색상, 간격, 폰트, 아이콘, 상태 표시 등은 기존 앱의 구현 방식을 우선 재사용한다.
- 장시간 실행 작업은 30초 이상 응답이나 로그 변화가 없으면 즉시 상태를 확인한다.
- 실행 중인지, 멈췄는지, 입력 대기인지, 네트워크/빌드 병목인지 구분하고 근거를 남긴다.
- 멈춤이나 무의미한 대기라고 판단되면 같은 방식으로 3분, 5분, 10분씩 기다리지 말고 프로세스 확인, 로그 확인, 타임아웃 재실행, 범위 축소, 다른 명령/경로 우회 중 하나로 전환한다.
- 장시간 명령을 시작할 때는 가능한 경우 타임아웃, 로그 파일, 진행 상태 확인 방법을 함께 둔다.
- 검색, 분석, 컨텍스트 수집은 `node_modules`, `.git`, `build`, `dist`, `.next`, `.dart_tool`, `.gradle`, `.gradle-local`, `coverage` 같은 의존성/빌드 산출물 폴더를 기본 제외한다.
- Windows 작업에서는 iOS/Xcode 전용 MCP나 도구를 자동으로 띄우지 않는다. 이미 떠 있는 `xcodebuildmcp`처럼 현재 플랫폼에 불필요한 보조 프로세스는 확인 후 정리한다.
- 범위는 사용자 요청에 맞게 좁게 유지한다.
- 관련 없는 파일을 수정하거나 삭제하지 않는다.
- 사용자가 만든 변경은 되돌리지 않는다.
- 새 구조는 정말 필요할 때만 만든다.
- 공통 규칙과 프로젝트 규칙이 충돌하면 프로젝트 문서를 우선한다.
- 프로젝트별 세부 규칙은 해당 프로젝트 문서에서 확인한다.

## 검증과 마무리
- 변경 후에는 재생성 스크립트와 검증 스크립트를 다시 돌린다.
- 모든 작업이 끝난 뒤에는 의도한 변경만 커밋하고 푸시한다.
- 앱/서비스 프로젝트는 커밋과 푸시 후 빌드와 실행 검증까지 완료한다.
- 앱이 아닌 문서/스크립트/위키 작업은 커밋과 푸시까지 완료한다.
- 결과를 설명할 때는 무엇을 바꿨는지, 무엇을 검증했는지, 남은 위험이 있는지를 분리해서 말한다.

## 프로젝트에서 반복 확인된 공통 규칙
<!-- [AUTO-COMMON:START] -->
- (새로 승격할 공통 규칙 없음)
<!-- [AUTO-COMMON:END] -->


# Resource Optimization Rules
<!-- 32GB RAM 로컬 개발 환경에서 AI 세션이 과도한 CPU/RAM/IO를 쓰지 않게 하는 공통 규칙 -->

## 기본 원칙
- 이 환경은 여러 AI 세션, Supabase, Vercel, Flutter/Android 도구가 동시에 실행될 수 있는 Windows 로컬 개발 환경이다.
- 정확도보다 무거운 전체 탐색을 우선하지 않는다. 필요한 파일만 좁게 읽고, 근거가 부족할 때만 범위를 단계적으로 넓힌다.
- 30초 이상 응답, 로그, 파일 변경, 프로세스 변화가 없으면 즉시 상태를 확인한다.
- 멈춤, 입력 대기, 네트워크 지연, 빌드 병목, Git hook 대기, 외부 도구 대기를 구분하고 다음 행동을 바꾼다.

## 탐색 범위 제한
- 기본 검색은 사용자 작성 소스와 설정 파일 중심으로 한다.
- 다음 폴더는 기본적으로 검색, 인덱싱, 컨텍스트 수집에서 제외한다: `node_modules`, `.git`, `build`, `dist`, `.next`, `.dart_tool`, `.gradle`, `.gradle-local`, `coverage`, `.cache`.
- 외부 라이브러리 구현을 로컬에서 훑지 않는다. 표준 API 사용법은 공식 지식이나 프로젝트의 직접 사용 예시만 확인한다.
- 대규모 재귀 검색이 필요하면 먼저 `rg --files`와 glob 제외를 사용하고, 결과 수를 제한한다.
- 저장소 전체 diff/status가 느리면 프로젝트별, 파일별, 생성 문서별로 쪼개서 확인한다.

## 컨텍스트와 출력
- 긴 세션에서는 현재 작업과 직접 관련 없는 큰 코드 블록, 로그, 중복 파일 내용을 다시 읽거나 다시 출력하지 않는다.
- 기존 내용을 설명할 때는 파일 경로와 핵심 함수/섹션만 유지하고, 전체 파일 재출력은 피한다.
- 코드 제안은 diff, 패치, 특정 함수/블록 중심으로 제공한다.
- 전체 파일 출력은 사용자가 명시적으로 요청했거나 파일이 매우 작을 때만 한다.

## 프로세스 관리
- 리소스 우선순위는 1순위 Codex, 2순위 Chrome/Edge의 ChatGPT·Claude 같은 AI 채팅, 3순위 그 외 앱이다.
- Codex 프로세스는 자동 종료하지 않고 CPU 우선순위를 높게 유지한다.
- Chrome/Edge는 ChatGPT·Claude 작업이 들어 있을 수 있으므로 기본 자동 종료 대상에서 제외하고, CPU 우선순위를 일반 백그라운드 앱보다 높게 유지한다.
- Windows에서는 `wiki ios-off`로 Codex의 iOS/Xcode 플러그인을 꺼서 `xcodebuildmcp` 재시작 루프를 막는다.
- AI_WIKI가 실행하는 큰 빌드, 테스트, 대량 검색, 장시간 동기화는 가능하면 `scripts/invoke-guarded-task.ps1` 또는 `wiki guarded`를 통해 실행한다.
- 전체 메모리 사용량이 70% 이상이거나 예상 작업 메모리를 더했을 때 70%를 넘으면 큰 작업을 즉시 실행하지 않고 리소스 큐에 넣는다.
- 큐에 쌓인 작업은 FIFO 순서로 처리하고, 실행해도 70%를 넘지 않을 때만 시작한다.
- 현재 상태는 `wiki resource` 또는 `wiki queue`로 확인한다.
- 메모리가 70%를 넘으면 큰 프로세스부터 종료하지 않는다. 먼저 Phone Link, Steam WebHelper, Discord, Teams, Epic, qBittorrent처럼 코딩 작업과 무관한 백그라운드 앱과 오래된 잔여 서버/데몬을 정리한다.
- 그래도 70%를 넘으면 큰 프로세스는 자동 종료하지 않고 후보로만 보고한다. 현재 작업 중인 Codex 세션, 빌드, 테스트, dev server, 브라우저 작업은 사용자가 명시하지 않는 한 종료하지 않는다.
- 사용자가 현재 Codex 작업만 한다고 명시하면 `wiki light`로 백그라운드 앱을 정리해 메모리를 즉시 낮춘다. Chrome/Edge는 2순위 보호 대상이므로 `wiki light aggressive`처럼 명시적인 공격 모드에서만 닫는다.
- Windows에서는 iOS/Xcode 전용 MCP나 도구를 자동 실행하지 않는다.
- `xcodebuildmcp`처럼 현재 플랫폼과 작업에 불필요한 보조 프로세스가 떠 있으면 확인 후 정리한다.
- Java/Gradle/Kotlin 데몬은 빌드 중인지 확인하고, 빌드가 끝난 뒤 남은 재시작 가능한 데몬만 정리한다.
- 활성 Flutter/Node/Vercel/Supabase dev server, test, build는 사용자의 다른 세션 작업일 수 있으므로 무작정 종료하지 않는다.
- 오래 멈춘 진단 명령, 중복 status/diff, 종료된 작업의 잔여 프로세스는 정리 대상이다.
- 자동 종료는 안전 목록에 한정한다. Codex 본체, 현재 작업 중인 Codex 세션, 활성 dev server, 활성 빌드/테스트, 브라우저, 보안/은행/드라이버 앱은 자동 종료하지 않는다.

## 장시간 명령 운영
- 장시간 명령은 가능하면 타임아웃, 로그 파일, 진행 확인 방법을 붙여 실행한다.
- 30초 이상 변화가 없으면 프로세스 CPU/RAM, 하위 프로세스, 로그 tail, 네트워크 대기 여부를 확인한다.
- 같은 명령을 무작정 반복하지 않는다. 범위를 줄이거나 다른 검증 경로로 우회한다.
- 병렬 실행은 파일/모듈/저장소가 겹치지 않을 때만 사용하고, 완료된 하위 작업은 즉시 닫는다.

## 완료 기준
- 리소스 최적화 관련 변경은 실제 프로세스 상태, 모니터 로그, 또는 제외 규칙 적용 여부로 검증한다.
- 작업이 끝나면 관련 변경만 커밋/푸시한다.
- 기존 사용자 작업으로 보이는 dirty 파일은 확인 없이 되돌리거나 묶어 커밋하지 않는다.


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
