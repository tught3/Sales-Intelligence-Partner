# Railway 배포 체크리스트

모든 준비가 완료되었습니다. Railway에서 다음 단계만 진행하면 됩니다.

> 최종 업데이트: 2026-04-30

## 준비 완료 사항 ✅
- ✅ API 서버: build + start 스크립트 준비
- ✅ 프론트엔드: build + start 스크립트 준비
- ✅ `.env.example`: 정확한 환경변수 명시
- ✅ `railway.json`: 양쪽 서비스에 빌드/시작 명령어 설정
- ✅ `server.js`: 프론트엔드 정적 서빙
- ✅ `vite.config.ts`: VITE_API_SERVER_URL 환경변수 지원
- ✅ `storage.ts`: API URL 동적 처리

---

## Railway 배포 단계

### 1. 기본 설정
```bash
npm install -g @railway/cli
railway login
```

### 2. 프로젝트 & DB 생성
```bash
cd /path/to/Sales-Intelligence-Partner
railway init
# → Project name: sales-intelligence

railway service create
# → PostgreSQL 선택
```

### 3. PostgreSQL URL 복사
Railway 대시보드 → PostgreSQL 서비스 → Variables:
- `DATABASE_URL` 값 **복사해두기**

---

### 4. API 서버 배포

```bash
railway service create
# → Root directory: artifacts/api-server

# 환경변수 설정
railway env set DATABASE_URL "postgresql://..." # 3단계에서 복사
railway env set AI_INTEGRATIONS_ANTHROPIC_API_KEY "sk-ant-..." # 본인 키
railway env set AI_INTEGRATIONS_ANTHROPIC_BASE_URL "https://api.anthropic.com"
railway env set SESSION_SECRET "$(openssl rand -hex 32)"
railway env set PORT 3001
railway env set NODE_ENV production

# 배포
railway up
railway logs  # 확인
```

로그에서 `Server listening` 메시지가 보이면 OK.

**API 서버 공개 URL 복사:**
```bash
railway service select api-server
railway domain  # 또는 대시보드 Networking 탭
```
→ `https://api-server-xxx.railway.app` 복사해두기

---

### 5. DB 마이그레이션

```bash
# Railway API 서버 배포 후
DATABASE_URL="postgresql://..." pnpm --filter @workspace/db run push
```

또는 Railway 원격에서:
```bash
railway run bash
cd /app
pnpm --filter @workspace/db run push
exit
```

---

### 6. 프론트엔드 배포

```bash
railway service create
# → Root directory: artifacts/sales-intelligence

# 환경변수
railway env set PORT 5000
railway env set VITE_API_SERVER_URL "https://api-server-xxx.railway.app"
# ↑ 4단계에서 복사한 API URL

# 배포
railway up
railway logs
```

로그에서 `Serving on 5000` 메시지가 보이면 OK.

---

### 7. 최종 확인

Railway 대시보드:
- 프론트엔드 서비스 → Networking → Public URL 확인
  - 예: `https://web-xxx.railway.app`

**브라우저에서 URL 접속** → 앱이 로드되면 성공!

---

## 환경변수 요약

| 변수 | 예시 | 설명 |
|------|------|------|
| `DATABASE_URL` | `postgresql://...` | PostgreSQL 서비스 (자동 생성) |
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY` | `sk-ant-...` | Claude API 키 |
| `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` | `https://api.anthropic.com` | Claude API 엔드포인트 |
| `SESSION_SECRET` | (임의 32자) | 세션 암호화 |
| `PORT` | `3001` (api) / `5000` (web) | 서비스 포트 |
| `NODE_ENV` | `production` | 환경 |
| `VITE_API_SERVER_URL` | `https://api-server-xxx.railway.app` | 프론트엔드가 호출할 API URL |

---

## 문제 해결

**배포 실패:**
```bash
railway logs  # 에러 메시지 확인
railway env  # 환경변수 재확인
```

**프론트엔드가 API를 못 찾음:**
- `VITE_API_SERVER_URL` 값이 정확한지 확인
- API 서버가 실제로 배포되었는지 확인 (logs 확인)

**DB 연결 실패:**
- `DATABASE_URL`이 정확한지 확인
- PostgreSQL 서비스가 실행 중인지 확인

---

## 로컬에서 다시 실행

```bash
pnpm dev  # 한 번에 양쪽 실행
```

브라우저: http://localhost:5000

