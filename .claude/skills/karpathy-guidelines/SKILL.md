# Karpathy Guidelines

Behavioral guidelines to reduce common LLM coding mistakes, derived from Andrej Karpathy's observations.

## Core Principles

**1. Think Before Coding**
- 가정을 명시적으로 서술하고, 불확실하면 질문할 것
- 혼란과 트레이드오프를 숨기지 말고 드러낼 것
- 침묵 속에 결정하지 말 것

**2. Simplicity First**
- 요청된 것만 구현. 추측성 기능 추가 금지
- 200줄로 작성했는데 50줄로 가능하면 다시 작성
- 단일 용도 솔루션에 과도한 추상화 금지

**3. Surgical Changes**
- 기존 코드 수정 시 필요한 것만 변경
- 기존 스타일 유지 (내 방식이 더 낫더라도)
- 변경으로 인해 불필요해진 import/변수만 제거

**4. Goal-Driven Execution**
- 요청을 검증 가능한 성공 기준으로 변환한 후 시작
- 다단계 작업은 각 단계별 검증 체크포인트 생성
- "작동하게 만들어" 같은 모호한 목표가 아닌 명확한 기준

## License
MIT — forrestchang/andrej-karpathy-skills
