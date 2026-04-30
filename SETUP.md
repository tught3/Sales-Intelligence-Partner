# JW 영업 비서 - 로컬 설치 가이드

GitHub에서 받은 코드를 본인 컴퓨터/서버에서 실행하는 방법입니다.

## 1. 사전 준비

- **Node.js 20 이상** (https://nodejs.org)
- **pnpm** 패키지 매니저: `npm install -g pnpm`
- **PostgreSQL 데이터베이스** (Neon, Supabase, 또는 직접 호스팅)
- **OpenAI API 키** (https://platform.openai.com/api-keys)

## 2. 코드 받기

```bash
git clone https://github.com/<본인계정>/<저장소이름>.git
cd <저장소이름>
git checkout <브랜치이름>   # 작업 브랜치로 이동
```

## 3. 환경변수 설정

```bash
cp .env.example .env
```

`.env` 파일을 열어 아래 값들을 채워주세요:

| 변수명 | 어디서 구하나 |
|---|---|
| `DATABASE_URL` | Neon/Supabase 대시보드 → Connection String |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | platform.openai.com → API Keys |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | `https://api.openai.com/v1` |
| `SESSION_SECRET` | 터미널에서 `openssl rand -hex 32` 실행 |

> **현재 Replit에 설정된 시크릿값을 그대로 쓰시려면**: Replit 좌측 사이드바
> **Secrets** (자물쇠 아이콘) 패널에서 각 항목의 값을 복사해 `.env`에 붙여넣으세요.

## 4. 의존성 설치 + DB 스키마 생성

```bash
pnpm install
pnpm --filter @workspace/db run db:push
```

## 5. 실행

```bash
# 영업 비서 웹앱
pnpm --filter @workspace/sales-intelligence run dev

# 백엔드 API 서버 (별도 터미널)
pnpm --filter @workspace/api-server run dev
```

브라우저에서 http://localhost:5000 접속.

## 6. 프로덕션 배포

가장 간단한 방법은 **Replit에서 그대로 사용**하시는 것입니다 (이미 배포되어 있음).
외부 호스팅이 필요하시면 Vercel, Railway, Fly.io 등을 추천드립니다.
