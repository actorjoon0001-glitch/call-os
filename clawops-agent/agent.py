"""
세움디자인하우징 AI 전화 안내원 — ClawOps 에이전트

070 번호로 걸려온 전화를 AI가 받아 방문 상담 예약을 유도하고,
수집한 예약을 CALL-OS(save-reservation 엔드포인트)에 저장한다.

ClawOps AI 에이전트는 WebSocket 역방향 연결로 동작하므로 **상시 구동 서버**가
필요하다 (Railway / Render / Fly.io / 소형 VPS 등에 배포). 서버리스(Netlify)에는
올라가지 않는다.

실행:
    pip install -r requirements.txt
    cp .env.example .env   # 값 채우기
    python agent.py

주의: ClawOps SDK 버전에 따라 클래스/파라미터명이 다를 수 있다. 공식 예제
(github.com/learners-superpumped/clawops-python)를 기준으로 작성했으며, 실제
가입 후 콘솔/문서에 맞춰 소폭 조정이 필요할 수 있다.
"""

import os
import asyncio
import httpx

from clawops.agent import ClawOpsAgent, OpenAIRealtime

# ──────────────────────────────────────────────
# 환경변수
# ──────────────────────────────────────────────
FROM_NUMBER = os.environ["CLAWOPS_FROM_NUMBER"]          # 발급받은 070 번호 (예: 07012345678)
CALLOS_SAVE_URL = os.environ["CALLOS_SAVE_URL"]          # https://call-os.netlify.app/.netlify/functions/save-reservation
WEBHOOK_SECRET = os.environ.get("RESERVATION_WEBHOOK_SECRET", "")
VOICE = os.environ.get("AGENT_VOICE", "marin")
LANGUAGE = os.environ.get("AGENT_LANGUAGE", "ko")
# CLAWOPS_API_KEY / CLAWOPS_ACCOUNT_ID 는 SDK가 환경변수에서 자동으로 읽는다.

# ──────────────────────────────────────────────
# 시스템 프롬프트 (CALL-OS ai_settings 기본값과 동일한 톤)
# 필요 시 이 문구만 고치면 전화 안내 톤이 바뀐다.
# ──────────────────────────────────────────────
SYSTEM_PROMPT = """당신은 세움디자인하우징의 전화 안내원입니다. 전화로 걸려온 고객을 응대합니다.

[역할/말투]
친절하고 밝은 하우징 쇼룸 방문 상담 안내원. 존댓말을 쓰고 한 번에 하나씩 질문합니다.
- 목표: 고객이 전시장을 직접 방문하는 "방문 상담 예약"을 잡도록 자연스럽게 유도합니다.
- 음성 통화이므로 답변은 1~2문장으로 짧고 명확하게.
- 고객이 유튜브/온라인에서 특정 평형·모델을 봤다고 하면 그 관심 평형(예: 20평)을 반드시 확인합니다.
- 예약에 필요한 정보: 성함, 관심 평형/모델, 희망 전시장, 희망 날짜, 희망 시간. 이미 말한 정보는 다시 묻지 않습니다.
- 성함/날짜/시간/전시장이 확인되면 save_reservation 도구를 호출해 예약을 저장하고, 예약이 접수되었음을 안내합니다.
- 고객이 사람(담당자) 연결을 원하면 정중히 안내하고 마무리합니다.

[회사 정보]
회사명: 세움디자인하우징
영업시간: 매일 09:00 ~ 18:00
전국 6개 전시장:
· 본점: 경기 김포시 김포대로 2295
· 제1전시장: 경기 김포시 통진읍 조강로 164
· 제3전시장: 경기 김포시 월곶면 포내리 162-12
· 강화전시장: 인천 강화군 길상면 길상로 311
· 안동전시장: 경북 안동시 이천동 860-8
· 광주전시장: 광주 광산구 임곡동 476
고객이 방문을 원하면 어느 지역/전시장을 원하는지 물어 가장 가까운 전시장으로 안내합니다.
"""

agent = ClawOpsAgent(
    from_=FROM_NUMBER,
    session=OpenAIRealtime(
        system_prompt=SYSTEM_PROMPT,
        voice=VOICE,
        language=LANGUAGE,
    ),
)


@agent.tool
async def save_reservation(
    name: str,
    date: str = "",
    time: str = "",
    showroom: str = "",
    interested_size: str = "",
    purpose: str = "",
    phone: str = "",
) -> str:
    """방문 상담 예약을 CALL-OS에 저장합니다.

    성함(name)과 희망 날짜/시간, 방문할 전시장(showroom), 관심 평형(interested_size)이
    확인되면 호출하세요. 전화번호(phone)는 발신번호가 있으면 함께 전달합니다.
    """
    payload = {
        "name": name,
        "phone": phone,
        "date": date,
        "time": time,
        "showroom": showroom,
        "interested_size": interested_size,
        "purpose": purpose,
    }
    headers = {"Content-Type": "application/json"}
    if WEBHOOK_SECRET:
        headers["x-webhook-secret"] = WEBHOOK_SECRET

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.post(CALLOS_SAVE_URL, json=payload, headers=headers)
            data = res.json()
    except Exception as e:  # noqa: BLE001
        return f"예약 저장 중 오류가 발생했습니다: {e}"

    if data.get("ok"):
        return "예약이 정상 접수되었습니다."
    return f"예약 저장에 실패했습니다: {data.get('error', '알 수 없는 오류')}"


if __name__ == "__main__":
    print(f"[세움디자인하우징 AI 안내원] {FROM_NUMBER} 대기 시작…")
    asyncio.run(agent.serve())
