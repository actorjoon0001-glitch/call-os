# 세움디자인하우징 AI 전화 안내원 (ClawOps 에이전트)

070 번호로 걸려온 전화를 AI가 받아 방문 상담 예약을 유도하고, 수집한 예약을
CALL-OS(`save-reservation` 엔드포인트)에 저장한다.

## 전체 그림

```
[고객] → 070 번호 → ClawOps(OpenAI Realtime, 우리 system_prompt)
      → AI가 방문예약 유도 (성함/관심평형/전시장/날짜/시간)
      → save_reservation 도구 호출
      → https://call-os.netlify.app/.netlify/functions/save-reservation
      → Supabase reservations 저장 → CALL-OS "방문예약" 화면에 표시
```

## ⚠️ 상시 구동 서버 필요
ClawOps AI 에이전트는 WebSocket 역방향 연결로 동작하므로 **24시간 켜져 있는
서버**가 필요하다. 서버리스(Netlify)에는 올릴 수 없다. 추천 호스팅:
- **Railway** / **Render** / **Fly.io** (소규모 무료~저가 티어)
- 또는 소형 VPS(예: 라이트세일, Vultr)나 사무실 상시 PC

## 준비물 (ClawOps 콘솔에서)
1. 회원가입 → https://claw-ops.com/
2. **API Key** (`sk_...`), **Account ID** (`AC...`) 발급
3. **070 번호** 발급 (Trial: 3일 / Individual: 월 19,000원 / Business: 월 99,000원)

## 로컬 실행
```bash
cd clawops-agent
pip install -r requirements.txt
cp .env.example .env      # 값 채우기
python agent.py
```

## 배포 (Railway 예시)
1. Railway에서 새 프로젝트 → 이 저장소 연결(또는 clawops-agent 폴더)
2. Start command: `python agent.py`
3. Variables 탭에 `.env.example` 의 값들을 등록
4. 배포 후 로그에 "대기 시작…"이 뜨면 070 번호로 전화 테스트

## CALL-OS 쪽 설정 (Netlify 환경변수)
`save-reservation` 함수가 DB에 쓰려면 아래가 필요하다:
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Supabase 프로젝트 설정에서 확인)
- `RESERVATION_WEBHOOK_SECRET` (임의 문자열 — 여기 agent의 값과 동일하게)

## 안내 톤 수정
`agent.py` 의 `SYSTEM_PROMPT` 문구만 고치면 전화 안내 톤/질문 순서가 바뀐다.
(CALL-OS 관리화면 "AI 안내원" 설정의 페르소나와 동일한 방향으로 유지 권장)

## 테스트 체크리스트
- [ ] 070 번호로 전화 → AI가 "세움디자인하우징입니다"로 응대하는가
- [ ] 지역 말하면 가까운 전시장 안내하는가
- [ ] 성함/날짜/시간까지 말하면 예약 저장 멘트가 나오는가
- [ ] CALL-OS "방문예약" 화면에 새 예약이 뜨는가
