-- =====================================================
-- CALL-OS: AI 안내원(방문예약 유도) 시스템
-- 대표번호 인바운드 콜을 AI가 응대하고 방문예약을 유도/기록한다.
-- =====================================================

-- 공통: updated_at 자동 갱신 트리거 함수
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 1. 방문예약 (Reservations)
-- =====================================================
CREATE TABLE reservations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_phone VARCHAR(20) NOT NULL,
  customer_name VARCHAR(100),
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  preferred_date DATE,
  preferred_time VARCHAR(30),
  purpose TEXT,
  status VARCHAR(20) DEFAULT '요청'
    CHECK (status IN ('요청', '확정', '취소', '방문완료', '노쇼')),
  source VARCHAR(50) DEFAULT 'AI안내원',
  memo TEXT,
  call_sid VARCHAR(64),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE reservations IS 'AI 안내원이 유도/접수한 방문예약';
COMMENT ON COLUMN reservations.preferred_time IS '희망 시간(자유 텍스트: "오후 2시", "14:00" 등)';
COMMENT ON COLUMN reservations.status IS '요청/확정/취소/방문완료/노쇼';
COMMENT ON COLUMN reservations.source IS '유입경로 (기본: AI안내원)';
COMMENT ON COLUMN reservations.call_sid IS '연관된 통신사 콜 식별자';

CREATE INDEX idx_reservations_phone ON reservations(customer_phone);
CREATE INDEX idx_reservations_status ON reservations(status);
CREATE INDEX idx_reservations_date ON reservations(preferred_date);
CREATE INDEX idx_reservations_team ON reservations(team_id);
CREATE INDEX idx_reservations_created ON reservations(created_at DESC);

CREATE TRIGGER trg_reservations_updated
  BEFORE UPDATE ON reservations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- 2. AI 통화 세션 (AI Call Sessions)
--    call_sid 기준으로 대화 상태(트랜스크립트)를 누적 저장
-- =====================================================
CREATE TABLE ai_call_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  call_sid VARCHAR(64) NOT NULL UNIQUE,
  customer_phone VARCHAR(20),
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  transcript JSONB DEFAULT '[]'::jsonb,
  intent VARCHAR(30),
  outcome VARCHAR(30) DEFAULT 'in_progress'
    CHECK (outcome IN ('in_progress', 'booked', 'transferred', 'ended', 'failed')),
  turn_count INTEGER DEFAULT 0,
  reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE ai_call_sessions IS 'AI 안내원과 고객의 대화 세션 상태';
COMMENT ON COLUMN ai_call_sessions.transcript IS '대화 턴 배열 [{role, content, ts}]';
COMMENT ON COLUMN ai_call_sessions.intent IS '추정 의도: 예약/문의/상담연결/기타';
COMMENT ON COLUMN ai_call_sessions.outcome IS 'in_progress/booked/transferred/ended/failed';

CREATE INDEX idx_ai_sessions_phone ON ai_call_sessions(customer_phone);
CREATE INDEX idx_ai_sessions_outcome ON ai_call_sessions(outcome);
CREATE INDEX idx_ai_sessions_created ON ai_call_sessions(created_at DESC);

CREATE TRIGGER trg_ai_sessions_updated
  BEFORE UPDATE ON ai_call_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- 3. AI 안내원 설정 (단일 행)
-- =====================================================
CREATE TABLE ai_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  company_name VARCHAR(100) DEFAULT '세움디자인하우징',
  greeting TEXT DEFAULT '유튜브 보고 연락 주셨나요? 방문 상담 예약 도와드릴게요.',
  persona TEXT DEFAULT '친절하고 밝은 하우징 쇼룸 방문 상담 안내원. 존댓말을 쓰고 한 번에 하나씩 질문한다. 고객이 유튜브나 온라인에서 특정 평형·모델을 봤다고 하면 그 관심 평형(예: 20평)을 반드시 확인해 방문 목적에 기록한다. 세움디자인하우징은 전국 6개 전시장(김포 본점·제1·제3, 강화, 안동, 광주)을 운영하므로, 고객이 방문을 원하면 어느 지역/전시장 방문을 원하는지 물어 가장 가까운 전시장으로 안내하고 선택한 전시장을 방문 목적에 함께 기록한다. 매장 방문 상담 예약을 목표로 성함 → 관심 평형/모델 → 희망 전시장 → 희망 날짜 → 희망 시간 순으로 부드럽게 유도한다.',
  business_hours VARCHAR(100) DEFAULT '매일 09:00 ~ 18:00',
  address TEXT DEFAULT E'전국 6개 전시장 운영\n· 본점: 경기 김포시 김포대로 2295\n· 제1전시장: 경기 김포시 통진읍 조강로 164\n· 제3전시장: 경기 김포시 월곶면 포내리 162-12\n· 강화전시장: 인천 강화군 길상면 길상로 311\n· 안동전시장: 경북 안동시 이천동 860-8\n· 광주전시장: 광주 광산구 임곡동 476',
  booking_enabled BOOLEAN DEFAULT true,
  fallback_to_human BOOLEAN DEFAULT true,
  max_turns INTEGER DEFAULT 8,
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE ai_settings IS 'AI 안내원 전역 설정 (단일 행: id=1)';
COMMENT ON COLUMN ai_settings.persona IS 'AI 안내원의 말투/역할 지침';
COMMENT ON COLUMN ai_settings.fallback_to_human IS '요청 시 사람(ARS 메뉴)으로 연결 허용';
COMMENT ON COLUMN ai_settings.max_turns IS '대화 최대 턴 수 (초과 시 사람 연결)';

CREATE TRIGGER trg_ai_settings_updated
  BEFORE UPDATE ON ai_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 기본 설정 1행 시드
INSERT INTO ai_settings (id) VALUES (1);
