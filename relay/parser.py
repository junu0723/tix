import json
import anthropic
from relay.config import ANTHROPIC_API_KEY

SYSTEM_PROMPT = """너는 미팅/통화 transcript를 분석해서 Linear ticket으로 변환하는 전문가야.

규칙:
- 각 ticket은 서로 독립적이고 실행 가능한 단위로 분리
- 중복 없이 mutually exclusive하게 분리
- JSON array만 출력 (다른 말 하지 말 것)
- transcript 언어와 동일한 언어로 ticket 작성

출력 형식:
[
  {
    "title": "...",
    "description": "...",
    "priority": 1,
    "labels": ["bug", "frontend"]
  }
]

우선순위 기준:
1 = 긴급 (서비스 장애, 데이터 유실 등)
2 = 높음 (핵심 기능 버그, 중요 요청)
3 = 보통 (개선사항, 일반 요청)
4 = 낮음 (nice-to-have, 나중에 해도 되는 것)"""


def parse_transcript(transcript: str) -> list[dict]:
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    message = client.messages.create(
        model="claude-sonnet-4-6-20250514",
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[
            {"role": "user", "content": f"transcript:\n{transcript}"}
        ],
    )

    raw = message.content[0].text.strip()
    # Strip markdown code fences if present
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1]
        raw = raw.rsplit("```", 1)[0]
    return json.loads(raw)
