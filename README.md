# relay-cli

회의/통화 transcript를 AI가 분석해서 Linear issue로 자동 변환하는 도구.

```
텍스트 (transcript) → Claude API (ticket 파싱) → Linear API (issue 생성) → 사람은 approve만
```

## Setup

```bash
pip install -r requirements.txt
cp .env.example .env
# .env에 API 키 입력
```

## Run

```bash
uvicorn relay.main:app --reload --port 8000
```

http://localhost:8000 에서 transcript 붙여넣기 → 분석 → Linear 생성.

## Environment Variables

| 변수 | 설명 |
|------|------|
| `ANTHROPIC_API_KEY` | Anthropic API 키 |
| `LINEAR_API_KEY` | Linear API 키 |
| `LINEAR_TEAM_ID` | Linear 팀 ID |

`ANTHROPIC_API_KEY`만 있으면 transcript 파싱까지 테스트 가능. Linear 생성은 세 키 모두 필요.
