# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

### JW 영업 비서 (`artifacts/sales-intelligence`)

- **Type**: React + Vite SPA at `/` (root)
- **Purpose**: JW중외제약 MR(의약품 영업사원) 전용 AI 영업 비서 앱
- **Stack**: React, Wouter, Tailwind CSS
- **Data storage**: PostgreSQL (server DB via `/api/data/*` routes) — 앱 시작 시 `initStorage()`로 서버 데이터를 캐시에 로드, 변경 시 캐시+서버 동시 업데이트
- **AI**: Anthropic Claude via Replit Integration (`claude-sonnet-4-6` 일반, `claude-haiku-4-5` OCR) — `/api/ai/chat` proxy

### DB Schema (lib/db/src/schema/index.ts)
- `doctors` — 교수 프로파일 (traits, objections, conversationHistory는 JSONB)
- `visit_logs` — 방문 기록
- `golden_snippets` — 핵심 멘트
- `hospital_profiles` — 병원 프로파일
- `department_profiles` — 과별 프로파일
- `company_manuals` — 회사 매뉴얼

### API Routes
- `/api/data/doctors` — CRUD
- `/api/data/visit-logs` — CRUD
- `/api/data/snippets` — CRUD
- `/api/data/hospitals` — CRUD
- `/api/data/departments` — CRUD
- `/api/data/manuals` — CRUD
- `/api/data/export` — POST, 전체 데이터 JSON 내보내기
- `/api/data/import` — POST, JSON 데이터 일괄 가져오기
- `/api/ai/chat` — Anthropic proxy

### Key Features
1. **교수 프로파일 DB** — 교수별 성향 태그, 반박 패턴, 방문 이력 관리
2. **AI 영업 일지 변환기** — 날것 메모 → 반응근거 + 다음방문계획 (230자 이내, 입력 말투 유지)
3. **반박 핸들링** — 교수별 반박 패턴 학습 + AI 대응책 생성
4. **핵심 멘트 라이브러리** — Golden Snippets 저장/태깅/AI 분석
5. **교수 파일 일괄 입력** — 병원명/과명/교수명 자동 파싱 + AI 성향 분석
6. **대시보드** — 영업 현황 한눈에 보기
7. **모바일 반응형** — 햄버거 메뉴 + 오버레이 사이드바, 반응형 패딩/그리드 (모바일/태블릿/데스크톱)
8. **통합 AI 컨텍스트** — 모든 AI 기능에서 교수/병원/과/멘트/방문기록/매뉴얼 전체 데이터 참조
9. **병원/과 특성 AI 자동 유추** — 등록된 교수 정보와 방문 기록으로부터 병원·과 특성을 AI가 자동 분석

### Key Files
- `artifacts/sales-intelligence/src/lib/storage.ts` — API-backed 데이터 레이어 (캐시 + 서버 동기화)
- `artifacts/sales-intelligence/src/lib/ai.ts` — AI API 호출 유틸리티
- `artifacts/sales-intelligence/src/pages/` — 페이지 컴포넌트들
- `artifacts/api-server/src/routes/data.ts` — 데이터 CRUD API
- `artifacts/api-server/src/routes/ai.ts` — Anthropic proxy (retry, origin check)
- `lib/db/src/schema/index.ts` — Drizzle ORM 테이블 정의
