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
- **Stack**: React, Wouter, Tailwind CSS, Replit AI Integration (OpenAI)
- **Data storage**: Browser LocalStorage (no backend required)
- **AI**: Replit OpenAI Integration via `AI_INTEGRATIONS_OPENAI_BASE_URL` / `AI_INTEGRATIONS_OPENAI_API_KEY` env vars (exposed via Vite `define`)

### Key Features
1. **교수 프로파일 DB** — 교수별 성향 태그, 반박 패턴, 방문 이력 관리
2. **AI 영업 일지 변환기** — 날것의 메모 → 전문 일지 + 다음 방문 전략 자동 생성
3. **반박 핸들링** — 교수별 반박 패턴 학습 + AI 대응책 생성
4. **핵심 멘트 라이브러리** — Golden Snippets 저장/태깅/AI 분석
5. **대시보드** — 영업 현황 한눈에 보기

### Key Files
- `artifacts/sales-intelligence/src/lib/storage.ts` — LocalStorage 데이터 레이어
- `artifacts/sales-intelligence/src/lib/ai.ts` — AI API 호출 유틸리티
- `artifacts/sales-intelligence/src/pages/` — 페이지 컴포넌트들
- `artifacts/sales-intelligence/vite.config.ts` — AI env vars exposed via `define`
