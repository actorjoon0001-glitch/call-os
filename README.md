# CALL-OS

기업용 고객전화 관리 앱 — 회사 대표번호로 들어온 모든 전화를 자동으로 고객 DB로 확보하고, 영업사원이 설치한 앱(PWA)에서 실시간으로 응대·관리한다.

## 핵심 가치

- **AI 안내원 (방문예약 유도)**: 대표번호로 걸려온 전화를 Claude 기반 AI가 응대 — 자연스러운 대화로 성함·희망일시·방문목적을 받아 방문 상담 예약을 잡고, 필요 시 상담원으로 연결
- **DB 자동 확보**: 대표번호로 들어온 모든 발신 번호가 즉시 `customers` 테이블에 기록 — 부재중 통화도 놓치지 않음
- **팀 기반 라우팅**: ARS 메뉴 → 팀(영업1팀/영업2팀/CS팀…) → 우선순위 영업사원 순차 연결 → 부재중 시 동시 울림
- **앱 설치 가능 (PWA)**: 영업사원이 모바일 홈 화면에 설치하여 사용
- **통신사 중립적 어댑터 구조**: Twilio(개발/시연), 세종텔레콤·KT 비즈콜·LG U+(국내 운영) 등 교체 가능

## 기술 스택

- **Frontend**: React 19 + Vite 8 + Tailwind CSS 4 + react-router-dom 7
- **Backend**: Supabase (Postgres + Auth + Edge Functions 가능)
- **PWA**: 자체 manifest + service worker (오프라인 캐싱)
- **통신**: 어댑터 패턴 (`api/call-routing/adapters/`) — Twilio / 국내 통신사

## 시작하기

```bash
npm install
cp .env.example .env       # 값 채우기
npm run dev                # http://localhost:5173
```

### 데이터베이스

Supabase 콘솔에서 `supabase/migrations/` 의 SQL을 순서대로 실행:

1. `001_init.sql` — 초기 스키마
2. `002_rename_showroom_to_team.sql` — 팀 개념으로 리네임 + 시드 정리
3. `003_ai_receptionist.sql` — AI 안내원(방문예약) 테이블: `reservations`, `ai_call_sessions`, `ai_settings`

> 🔧 신규 설치 환경이면 세 파일을 차례로 적용하면 깨끗한 스키마가 만들어진다.

## 앱 설치 (PWA)

빌드 후 HTTPS 환경(Netlify 배포 등)에서 모바일 브라우저로 접속:

- **Android (Chrome)**: 주소창 우측 메뉴 → "홈 화면에 추가"
- **iOS (Safari)**: 공유 → "홈 화면에 추가"

설치 후 앱 아이콘으로 실행하면 standalone 모드로 동작.

> 📌 풀 PWA 인증을 위해서는 192/512 사이즈 PNG 아이콘 추가 권장 (현재는 SVG 단일 아이콘).

## 통화 라우팅 흐름

```
[고객] → [회사 대표번호]
   → 통신사 → POST /api/call-routing/inbound
   → ARS 멘트(동적: 활성 팀 목록 기반) + 메뉴 입력
   → POST /api/call-routing/menu-select
   → 팀 선택 → 1순위 영업사원 호출 (벨 ~15초)
   → POST /api/call-routing/status-callback
   → 부재중 시: 다음 영업사원 → 마지막엔 전체 동시 울림
   → 통화 결과 → call_logs 저장 + 발신자 customers 업서트
```

## AI 안내원 흐름 (방문예약 유도)

대표번호 인바운드를 AI가 먼저 응대하려면 통신사 웹훅을 `ai-inbound`로 연결한다.
(기존 ARS 메뉴 라우팅은 상담원 연결 폴백으로 그대로 사용)

```
[고객] → [회사 대표번호]
   → 통신사 → POST /api/call-routing/ai-inbound
   → 인사 + 음성 응답 수집 (<Gather input="speech">)
   → POST /api/call-routing/ai-turn   (발화 전사 결과 도착)
   → Claude 응대 생성 → action 분기
        · continue : 다시 음성 수집 (정보 계속 수집)
        · book     : reservations 저장 후 종료
        · transfer : 기존 ARS 메뉴(/inbound)로 상담원 연결
        · goodbye  : 종료
   → 대화 상태는 call_sid 기준 ai_call_sessions 에 누적
```

- 관리 화면: **AI 안내원**(설정·대화이력), **방문예약**(예약 확정/취소/관리)
- 필요 환경변수: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (`.env.example` 참고)
- 안내원 말투·인사말·영업시간·상담원 연결 허용 여부는 `ai_settings`(관리 화면)에서 설정

## 통신사 어댑터 추가하기

`api/call-routing/adapters/` 에 새 파일 생성 후 `index.js` 에 등록:

```js
// adapters/sejong.js
export const sejongAdapter = {
  parseInbound(req) { ... },
  buildIVRResponse({ greeting, actionUrl, retryUrl, timeoutSec }) { ... },
  buildDialSingle({ phone, callerId, timeoutSec, statusCallbackUrl }) { ... },
  buildDialBroadcast({ phones, callerId, timeoutSec, statusCallbackUrl }) { ... },
  buildSayAndHangup(message) { ... },
  buildHangup() { ... },
}
```

`TELEPHONY_PROVIDER` 환경변수로 런타임 선택.

## 디렉토리 구조

```
src/
├── pages/          # Dashboard, AiReceptionist, Reservations, Teams, Agents, Customers, CallLogs, ConsultLogs
├── components/     # layout/, ui/
├── lib/
│   ├── supabase.js     # DB 액세스 함수
│   └── callRouting.js  # 라우팅 엔진 (클라이언트 시뮬레이션 포함)
├── hooks/
└── main.jsx        # SW 등록 포함

api/
├── lib/
│   └── claude.js           # Anthropic Claude 래퍼 (AI 안내원 응대 생성)
└── call-routing/
    ├── inbound.js          # ARS 라우팅 웹훅 핸들러 4개
    ├── ai-receptionist.js  # AI 안내원 대화 핸들러 (ai-inbound / ai-turn)
    └── adapters/
        ├── index.js        # 어댑터 셀렉터
        └── twilio.js       # Twilio TwiML (음성 Gather 포함)

supabase/migrations/    # SQL 스키마 + 시드
public/
├── manifest.webmanifest
├── sw.js
└── favicon.svg
```

## 다음 단계 (로드맵)

1. 영업사원용 모바일 전용 화면 (통화 알림 + 빠른 메모)
2. 영업사원 인증 / 멀티테넌트 (회사 단위 분리)
3. 푸시 알림 (Web Push) — 신규 통화/신규 예약 수신 시
4. ~~AI 응대 (방문예약 유도)~~ ✅ Claude 기반 AI 안내원 (Phase 1 완료)
   - 다음: 예약 가능 슬롯/영업시간 검증, 캘린더 연동, 예약 확정 SMS 발송
5. AI 안내원 고도화 — 실시간 음성(Media Streams), 통화 요약 자동 저장
6. 국내 통신사(세종텔레콤/KT) 어댑터 정식 구현 (음성 Gather 포함)
