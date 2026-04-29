# JW영업 비서 (Sales Intelligence Partner)

## 프로젝트 개요
의약 영업 비서 웹앱. 의사/병원 정보, 방문 로그, 제품 정보, 금영 스니펫을 관리하고 Claude AI로 분석하는 도구.

- **기술 스택**: TypeScript, React 19, Express, PostgreSQL, Drizzle ORM, Tailwind CSS v4, Vite
- **구조**: pnpm monorepo (artifacts/, lib/)
- **배포**: Railway 예정
- **언어**: 한국어 + 코드

---

## 로컬 개발 시작

### 0. 필수 설치
- Node.js 20+
- pnpm 10+
- PostgreSQL (또는 Neon/Railway 데이터베이스)

### 1. 세팅
```bash
pnpm install
cp .env.example .env  # 필요시
```

`.env` 파일에서:
- `DATABASE_URL` = PostgreSQL 연결 문자열
- `AI_INTEGRATIONS_ANTHROPIC_API_KEY` = Claude API 키
- `SESSION_SECRET` = 임의 문자열 (openssl rand -hex 32)
- `PORT` = 5000 (프론트엔드 Vite)
- `API_SERVER_PORT` = 3001 (백엔드)

### 2. DB 초기화 (처음 한 번만)
```bash
pnpm --filter @workspace/db run push
```

### 3. 개발 서버 실행
```bash
pnpm dev
```
또는 별도 터미널:
```bash
# 터미널 1: API 서버
pnpm --filter @workspace/api-server run dev

# 터미널 2: 프론트엔드
pnpm --filter @workspace/sales-intelligence run dev
```

→ 브라우저: http://localhost:5000

---

## 프로젝트 구조

```
artifacts/
├── api-server/          # Express API (포트 3001)
│   ├── src/
│   │   ├── app.ts       # Express 설정
│   │   ├── index.ts     # 서버 진입점
│   │   ├── routes/
│   │   │   ├── ai.ts    # Claude AI 프록시
│   │   │   └── data.ts  # CRUD API
│   │   └── lib/logger.ts
│   └── build.mjs        # esbuild 설정
│
└── sales-intelligence/  # React 프론트엔드 (포트 5000)
    ├── src/
    │   ├── main.tsx
    │   ├── App.tsx
    │   ├── pages/       # 라우트별 페이지
    │   ├── components/  # UI 컴포넌트 (shadcn/ui)
    │   └── lib/
    │       ├── storage.ts   # API 클라이언트 + 캐시
    │       ├── ai.ts        # AI 통합
    │       └── utils.ts
    ├── vite.config.ts
    └── index.css        # Tailwind v4

lib/
├── db/                  # Drizzle ORM
│   └── src/
│       ├── index.ts     # DB 인스턴스
│       └── schema/      # 테이블 정의
│
└── api-zod/            # API 타입/검증
    └── src/generated/
```

---

## 개발 원칙

### 코드 작업 플로우
1. **기능 추가/수정** → 직접 구현
2. **복잡한 리팩토링** → `simplify` 스킬 사용 (코드 리뷰)
3. **보안 관련** → `security-review` 스킬 사용
4. **PR/병합 전** → `review` 스킬 사용

### 규칙
- 타입 안전: TypeScript strict mode, Zod 검증
- 데이터베이스: Drizzle ORM, 마이그레이션은 `pnpm --filter @workspace/db run push`
- 스타일: Tailwind CSS v4, 커스텀 컬러 변수는 `index.css` 참고
- API: `/api/` 경로로 proxy (Vite 자동 라우팅)
- 상태관리: React Query + localStorage 캐시

### 파일 정리 규칙
- 불필요한 Replit 파일들은 정기적으로 제거
- 사용하지 않는 라이브러리는 삭제 (의존성 최소화)
- 테스트 코드: 유지보수 필수

---

## 배포 (Railway)

### 준비 단계

1. **Railway 가입**: https://railway.app
2. **CLI 설치**:
   ```bash
   npm install -g @railway/cli
   railway login
   ```

### 아키텍처
```
Railway:
├── PostgreSQL (DB)
├── api-server (Node.js, 포트 3001)
└── sales-intelligence (Node.js, 포트 5000 → 정적 빌드)
```

---

### 1️⃣ 데이터베이스 (PostgreSQL)

```bash
railway init
# → 새 프로젝트 생성 (이름: sales-intelligence)

railway add
# → PostgreSQL 선택
```

Railway 대시보드에서 `Variables` 탭:
- `DATABASE_URL` 자동 생성됨 → 복사해두기

---

### 2️⃣ API 서버 배포

#### 2-1. 새 서비스 추가
```bash
railway service create
# → 이름: api-server
# → Root directory: artifacts/api-server
```

#### 2-2. 빌드 & 실행 설정

Railway가 자동으로 감지하지만, 명시적으로 설정하려면:

**프로젝트 루트에 `railway.json` 생성:**
```json
{
  "buildCommand": "pnpm install && pnpm build",
  "startCommand": "pnpm start"
}
```

또는 `artifacts/api-server/railway.json`:
```json
{
  "buildCommand": "pnpm install",
  "startCommand": "pnpm start"
}
```

#### 2-3. 환경변수 설정

```bash
railway service select api-server
railway env set DATABASE_URL $(railway var -s postgres DATABASE_URL)
railway env set AI_INTEGRATIONS_ANTHROPIC_API_KEY "sk-ant-..."
railway env set PORT 3001
railway env set NODE_ENV production
railway env set SESSION_SECRET $(openssl rand -hex 32)
railway env set AI_INTEGRATIONS_ANTHROPIC_BASE_URL "https://api.anthropic.com"
```

또는 Railway 대시보드 → `api-server` 서비스 → `Variables`:
| Key | Value |
|-----|-------|
| `DATABASE_URL` | postgres://... (PostgreSQL 서비스에서 복사) |
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY` | sk-ant-... |
| `PORT` | 3001 |
| `NODE_ENV` | production |
| `SESSION_SECRET` | (임의 32자) |

#### 2-4. DB 마이그레이션 (초기 1회)

```bash
# 로컬에서
DATABASE_URL=<Railway-DB-URL> pnpm --filter @workspace/db run push
```

또는 Railway 배포 후 원격에서:
```bash
railway run bash
pnpm --filter @workspace/db run push
exit
```

---

### 3️⃣ 프론트엔드 배포

#### 3-1. 프론트엔드 빌드
```bash
pnpm --filter @workspace/sales-intelligence run build
# → dist/public/ 생성
```

#### 3-2. 정적 서버 설정

**`artifacts/sales-intelligence/railway.json`:**
```json
{
  "buildCommand": "cd ../.. && pnpm --filter @workspace/sales-intelligence run build",
  "startCommand": "node -e \"require('express')().use(require('express').static('./artifacts/sales-intelligence/dist/public')).listen(5000, () => console.log('Serving on 5000'))\""
}
```

또는 더 간단하게, Express 앱을 추가:

**`artifacts/sales-intelligence/server.js`:**
```javascript
const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 5000;

app.use(express.static(path.join(__dirname, 'dist/public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist/public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Serving on http://localhost:${port}`);
});
```

**`artifacts/sales-intelligence/package.json` (start 스크립트 추가):**
```json
{
  "scripts": {
    "start": "node server.js",
    "build": "vite build --config vite.config.ts"
  }
}
```

#### 3-3. Railway 설정
```bash
railway service create
# → 이름: web
# → Root directory: artifacts/sales-intelligence

railway env set API_SERVER_URL https://api-server-<random>.railway.app
```

Vite 빌드 시 API URL 참조:
**`artifacts/sales-intelligence/vite.config.ts` 수정:**
```typescript
const apiUrl = process.env.VITE_API_URL || 
               process.env.API_SERVER_URL || 
               'http://localhost:3001';
```

---

### 4️⃣ 도메인 연결 (선택사항)

Railway 대시보드 → 프로젝트 → 서비스 → Networking:
- 공개 도메인 자동 생성: `api-server-xxx.railway.app`
- 커스텀 도메인 추가 가능

---

### ⚡ 한 번에 배포하기

**초기 배포 체크리스트:**

```bash
# 1. 로컬 테스트
pnpm dev
pnpm --filter @workspace/db run push

# 2. Railway 프로젝트 생성
railway init

# 3. 서비스 추가 (PostgreSQL, api-server, web)
railway service create

# 4. 각 서비스에 환경변수 설정

# 5. 배포 확인
railway status
```

---

### 🔧 문제 해결

#### API 서버 배포 실패
```bash
railway service select api-server
railway logs
# → 에러 메시지 확인, 환경변수 재설정
```

#### 프론트엔드가 API를 못 찾음
- Vite 빌드 시 API URL이 올바른지 확인
- `dist/public/index.html` 의 script 태그가 정확한지 확인
- CORS 설정: api-server에서 프론트엔드 도메인 허용

#### DB 연결 실패
- `DATABASE_URL` 정확한지 확인
- `pnpm --filter @workspace/db run push` 실행 확인

---

## 문제 해결

### Tailwind CSS 스타일 안 보임
- Windows: `@tailwindcss/oxide-win32-x64-msvc` 설치 필요
- `pnpm install` 재실행

### 포트 충돌
- API: 3001, 프론트엔드: 5000 (기본값)
- `.env` 에서 `PORT`, `API_SERVER_PORT` 변경 가능

### DB 연결 실패
- `.env` 의 `DATABASE_URL` 확인
- `pnpm --filter @workspace/db run push` 재실행

---

## 메모리/기록

중요한 프로젝트 결정사항이나 회귀 버그는 `memory/` 디렉토리에 저장.
