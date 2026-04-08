-- =====================================================
-- CALL-OS: 대표번호 기반 고객전화 분배 + 고객DB 관리 시스템
-- Database Schema v1.0
-- =====================================================

-- 1. 전시장 (Showrooms)
CREATE TABLE showrooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(20) NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE showrooms IS '전시장 정보';
COMMENT ON COLUMN showrooms.name IS '전시장명';
COMMENT ON COLUMN showrooms.code IS '전시장 코드 (ARS 메뉴 매핑용)';
COMMENT ON COLUMN showrooms.is_active IS '활성/비활성 상태';

-- 2. 영업팀원 (Sales Agents)
CREATE TABLE sales_agents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  showroom_id UUID NOT NULL REFERENCES showrooms(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  priority INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE sales_agents IS '영업팀원 정보';
COMMENT ON COLUMN sales_agents.priority IS '순차 연결 우선순위 (1이 가장 높음)';
COMMENT ON COLUMN sales_agents.phone IS '휴대폰 번호';

CREATE INDEX idx_agents_showroom ON sales_agents(showroom_id);
CREATE INDEX idx_agents_priority ON sales_agents(showroom_id, priority);

-- 3. 고객 (Customers)
CREATE TABLE customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100),
  phone VARCHAR(20) NOT NULL,
  region VARCHAR(50),
  content TEXT,
  manager VARCHAR(100),
  status VARCHAR(20) DEFAULT '신규' CHECK (status IN ('신규', '상담중', '계약', '보류')),
  memo TEXT,
  source VARCHAR(50),
  showroom_id UUID REFERENCES showrooms(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE customers IS '고객 정보';
COMMENT ON COLUMN customers.status IS '상태: 신규/상담중/계약/보류';
COMMENT ON COLUMN customers.source IS '유입경로';

CREATE UNIQUE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_status ON customers(status);
CREATE INDEX idx_customers_showroom ON customers(showroom_id);

-- 4. 통화 로그 (Call Logs)
CREATE TABLE call_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_phone VARCHAR(20) NOT NULL,
  showroom_id UUID REFERENCES showrooms(id) ON DELETE SET NULL,
  selected_menu VARCHAR(10),
  call_status VARCHAR(20) DEFAULT 'ringing'
    CHECK (call_status IN ('ringing', 'answered', 'missed', 'failed', 'voicemail')),
  answered_by_agent_id UUID REFERENCES sales_agents(id) ON DELETE SET NULL,
  ring_attempt_count INTEGER DEFAULT 0,
  broadcast_triggered BOOLEAN DEFAULT false,
  answer_duration INTEGER,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE call_logs IS '통화 라우팅 로그';
COMMENT ON COLUMN call_logs.selected_menu IS '고객이 선택한 ARS 메뉴 번호';
COMMENT ON COLUMN call_logs.call_status IS 'ringing/answered/missed/failed/voicemail';
COMMENT ON COLUMN call_logs.ring_attempt_count IS '순차 연결 시도 횟수';
COMMENT ON COLUMN call_logs.broadcast_triggered IS '전체 동시 울림 발동 여부';
COMMENT ON COLUMN call_logs.answer_duration IS '통화 시간(초)';

CREATE INDEX idx_call_logs_phone ON call_logs(customer_phone);
CREATE INDEX idx_call_logs_showroom ON call_logs(showroom_id);
CREATE INDEX idx_call_logs_status ON call_logs(call_status);
CREATE INDEX idx_call_logs_created ON call_logs(created_at DESC);

-- 5. 상담 로그 (Consult Logs)
CREATE TABLE consult_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  manager VARCHAR(100),
  content TEXT,
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE consult_logs IS '상담 히스토리';

CREATE INDEX idx_consult_logs_customer ON consult_logs(customer_id);
CREATE INDEX idx_consult_logs_created ON consult_logs(created_at DESC);

-- =====================================================
-- 초기 시드 데이터
-- =====================================================

-- 전시장 기본 데이터
INSERT INTO showrooms (name, code, is_active) VALUES
  ('김포전시장', 'GIMPO', true),
  ('강화전시장', 'GANGHWA', true),
  ('서울전시장', 'SEOUL', true);

-- 영업팀원 샘플 데이터
INSERT INTO sales_agents (showroom_id, name, phone, priority, is_active)
SELECT s.id, a.name, a.phone, a.priority, true
FROM showrooms s
CROSS JOIN LATERAL (
  VALUES
    ('홍길동', '010-1234-5678', 1),
    ('김민수', '010-2345-6789', 2),
    ('박철수', '010-3456-7890', 3)
) AS a(name, phone, priority)
WHERE s.code = 'GIMPO';

INSERT INTO sales_agents (showroom_id, name, phone, priority, is_active)
SELECT s.id, a.name, a.phone, a.priority, true
FROM showrooms s
CROSS JOIN LATERAL (
  VALUES
    ('이영희', '010-4567-8901', 1),
    ('최준혁', '010-5678-9012', 2)
) AS a(name, phone, priority)
WHERE s.code = 'GANGHWA';

INSERT INTO sales_agents (showroom_id, name, phone, priority, is_active)
SELECT s.id, a.name, a.phone, a.priority, true
FROM showrooms s
CROSS JOIN LATERAL (
  VALUES
    ('정수진', '010-6789-0123', 1),
    ('한미래', '010-7890-1234', 2),
    ('오세훈', '010-8901-2345', 3)
) AS a(name, phone, priority)
WHERE s.code = 'SEOUL';

-- 샘플 고객
INSERT INTO customers (name, phone, region, status, source, showroom_id)
SELECT '김철수', '010-9999-1111', '김포시', '상담중', '네이버광고', s.id
FROM showrooms s WHERE s.code = 'GIMPO';

INSERT INTO customers (name, phone, region, status, source, showroom_id)
SELECT '이미영', '010-9999-2222', '강화군', '신규', '직접방문', s.id
FROM showrooms s WHERE s.code = 'GANGHWA';

INSERT INTO customers (name, phone, region, status, source)
VALUES ('박지훈', '010-9999-3333', '서울시', '신규', '홈페이지');
