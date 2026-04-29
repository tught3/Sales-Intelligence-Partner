# Agent Operations Rules

## 절대 수정 금지
- `lite-app/`은 절대 수정하지 않는다.
- 메인 앱 수정은 `client/src/` 기준으로 진행한다.

## 금융 원문 저장소
- 금융 원문 단일 진실 소스는 Supabase `financial_raw_archive`다.
- `transactions.raw_text`와 각종 `scripts/*.json` 레거시 파일은 복구/백필 용도로만 쓴다.
- 원문이 비어 있으면 `node scripts/backfill-financial-raw-archive.mjs`로 먼저 보강한다.
- `scripts/replay-permanent-batch.mjs`는 기본적으로 `financial_raw_archive` 기준만 사용한다.

## 파서 회귀
- `unified-financial-parser.ts` 수정 시:
  - `node --import ./scripts/loader-hook.mjs scripts/run-financial-regression.mjs`
  를 우선 회귀 기준으로 사용한다.

## 보안
- Supabase 테이블/정책/쿼리 수정 시 RLS 영향을 확인한다.
- API Key, 서비스 키, 토큰 등 민감 정보는 프론트엔드에 직접 노출하지 않는다.
- `.env` 등 환경 변수 사용과 클라이언트 번들 유출 가능성을 함께 본다.
- 증상 가리기보다 원인 기준 수정이 원칙이다.

## 배포/운영
- 사용자가 막지 않는 한 서버 변경은 GitHub 푸시와 Railway 반영까지 기본 범위로 본다.
- 중요한 운영 단계는 답변에서 먼저 눈에 띄게 강조한다.
- 배포 설명 시 가능하면 반영 파일, 서비스 이름, 확인 방법, 미반영 영향까지 적는다.

## 로그 해석
- `디버그`, `디버그 로그`, `로그`는 기본적으로 지렁이 버튼에서 복사한 디버그 패널 로그로 해석한다.
- "로그 확인/봐" → 무조건 `/c/ai-automatic-expense-tracker/debug.log` 확인.
- `debug.log`는 저장소 루트의 `debug.log`를 뜻한다.
- `logcat.txt`는 네이티브 파일 로그로 본다. 명시 시에만 사용.
- 로그가 섞일 수 있으면 이번에 본 로그 종류를 먼저 밝힌다.

## 용어
- **영구데이터저장소** → `/storage/emulated/0/Download/AIExpenseTracker/card_notification_store.json`
  - ADB: `adb -s 192.168.0.102:5555 pull /storage/emulated/0/Download/AIExpenseTracker/card_notification_store.json`
- **이슈기록 데이터보관소** → `Downloads/AIExpenseTracker/collected_notifications_testnotifier.json`

## 파인튜닝 명령
- 기본 통합 명령:
  - `node --import ./scripts/loader-hook.mjs scripts/generate-finetuning-all.mjs`
- Supabase 원문 추출:
  - `npm run finetuning:supabase:raw`
- Supabase 학습 데이터만:
  - `npm run finetuning:supabase`
