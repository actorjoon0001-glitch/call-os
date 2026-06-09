# CALL-OS

기업용 고객전화 관리 앱 — 회사 대표번호로 들어온 모든 전화를 자동으로 고객 DB로 확보하고, 영업사원이 설치한 앱(PWA)에서 실시간으로 응대·관리한다.

## 핵심 가치

- **DB 자동 확보**: 대표번호로 들어온 모든 발신 번호가 즉시 `customers` 테이블에 기록 — 부재중 통화도 놓치지 않음
- **팀 기반 라우팅**: ARS 메뉴 → 팀(영업1팀/영업2팀/CS팀…) → 우선순위 영업사원 순차 연결 → 부재중 시 동시 울림
- **앱 설치 가능 (PWA)**: 영업사원이 모바일 홈 화면에 설치하여 사용
- **통신사 중립적 어댑터 구조**: Twilio(개발/시연), 세종텔레콤·KT 비즈콜·LG U+(국내 운영) 등 교체 가능

## 기술 스택

- **Frontend**: React 19 + Vite 8 + Tailwind CSS 4 + react-router-dom 7
- **Backend**: Supabase (Postgres + Auth + Edge Functions 가능)
- **PWA**: 자체 manifest + service worker (오프라인 캐싱)
- **통신**: 어댑터 패턴 (`api/call-routing/adapters/`) — Twilio / 국내 통신사

## 시작하기 (실제 Supabase 연결)

실제 데이터로 사용·테스트하려면 Supabase 프로젝트 한 개만 연결하면 된다.

### 1) Supabase 프로젝트 생성 + DB 스키마 적용

1. [supabase.com](https://supabase.com) → **New project** 생성
2. 좌측 **SQL Editor** → **New query** → `supabase/setup.sql` 내용을 통째로 붙여넣고 **Run**
   - 스키마 + RLS 정책 + 샘플 시드(팀/영업사원/고객)가 한 번에 구성된다
   - 여러 번 실행해도 안전(멱등) — 매 실행마다 데이터는 초기화됨

### 2) 프로젝트 키를 `.env` 에 입력

Supabase **Project Settings → API** 에서 값 복사:

```bash
cp .env.example .env
```

`.env` 에서 아래 두 값을 실제 값으로 교체(프론트엔드 필수):

```
VITE_SUPABASE_URL=https://xxxx.supabase.co     # Project URL
VITE_SUPABASE_ANON_KEY=eyJ...                  # anon public key
```

> 서버리스 라우팅 API(`api/`)를 배포할 때만 `SUPABASE_SERVICE_ROLE_KEY` 등 나머지 값이 필요하다. 프론트 화면 테스트에는 위 두 값이면 충분하다.

### 3) 연결 점검 후 실행

```bash
npm install
npm run check:db      # .env 값으로 실제 연결/스키마/시드 확인
npm run dev           # http://localhost:5173
```

`check:db` 가 모든 테이블에 `✓` 를 찍으면 연결 완료다.

> 🔧 `supabase/migrations/` 의 `001_init.sql` → `002_rename_showroom_to_team.sql` 는 변경 이력용이다. **신규 설치는 `supabase/setup.sql` 하나만** 실행하면 된다.
>
> ⚠️ `setup.sql` 의 RLS 정책은 anon 전체 허용(개발/테스트용)이다. 운영 전에는 로그인·역할 기반으로 좁혀야 한다.

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
├── pages/          # Dashboard, Teams, Agents, Customers, CallLogs, ConsultLogs
├── components/     # layout/, ui/
├── lib/
│   ├── supabase.js     # DB 액세스 함수
│   └── callRouting.js  # 라우팅 엔진 (클라이언트 시뮬레이션 포함)
├── hooks/
└── main.jsx        # SW 등록 포함

api/
└── call-routing/
    ├── inbound.js          # 웹훅 핸들러 4개 (어댑터 사용)
    └── adapters/
        ├── index.js        # 어댑터 셀렉터
        └── twilio.js       # Twilio TwiML

supabase/migrations/    # SQL 스키마 + 시드
public/
├── manifest.webmanifest
├── sw.js
└── favicon.svg
```

## 다음 단계 (로드맵)

1. 영업사원용 모바일 전용 화면 (통화 알림 + 빠른 메모)
2. 영업사원 인증 / 멀티테넌트 (회사 단위 분리)
3. 푸시 알림 (Web Push) — 신규 통화 수신 시
4. AI 응대 (부재중·업무외 시간) — Vapi/Retell 또는 Twilio + Realtime
5. 방문예약 슬롯 채우기 봇
6. 국내 통신사(세종텔레콤/KT) 어댑터 정식 구현
