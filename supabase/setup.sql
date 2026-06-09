-- =====================================================
-- CALL-OS: 신규 Supabase 프로젝트용 통합 셋업 스크립트
-- =====================================================
-- 이 파일 하나만 Supabase 콘솔(SQL Editor)에 붙여넣어 실행하면
-- 깨끗한 스키마 + RLS 정책 + 샘플 시드가 한 번에 구성된다.
--
-- migrations/001_init.sql + 002_rename_showroom_to_team.sql 를
-- 순서대로 적용한 최종 상태("teams" 도메인)와 동일하다.
--
-- ⚠️  멱등(idempotent)하게 작성되어 있어 여러 번 실행해도 안전하다.
--     (DROP ... CASCADE 후 재생성하므로 기존 데이터는 초기화된다)
-- =====================================================

-- 기존 객체 정리 (재실행 안전성)
DROP TABLE IF EXISTS consult_logs CASCADE;
DROP TABLE IF EXISTS call_logs    CASCADE;
DROP TABLE IF EXISTS customers     CASCADE;
DROP TABLE IF EXISTS sales_agents  CASCADE;
DROP TABLE IF EXISTS teams         CASCADE;

-- 1. 팀/지점/부서 (Teams)
CREATE TABLE teams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(20) NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE teams IS '팀/지점/부서 정보 (기업별 라우팅 단위)';
COMMENT ON COLUMN teams.name IS '팀명 (회사 설정에 따라 "팀/지점/부서"로 라벨링)';
COMMENT ON COLUMN teams.code IS '팀 코드 (ARS 메뉴 매핑용, 예: SALES-1)';

-- 2. 영업사원 (Sales Agents)
CREATE TABLE sales_agents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  priority INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE sales_agents IS '영업사원 정보';
COMMENT ON COLUMN sales_agents.priority IS '순차 연결 우선순위 (1이 가장 높음)';
COMMENT ON COLUMN sales_agents.phone IS '휴대폰 번호';

CREATE INDEX idx_agents_team ON sales_agents(team_id);
CREATE INDEX idx_agents_team_priority ON sales_agents(team_id, priority);

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
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE customers IS '고객 정보';
COMMENT ON COLUMN customers.status IS '상태: 신규/상담중/계약/보류';
COMMENT ON COLUMN customers.source IS '유입경로';

CREATE UNIQUE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_status ON customers(status);
CREATE INDEX idx_customers_team ON customers(team_id);

-- 4. 통화 로그 (Call Logs)
CREATE TABLE call_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_phone VARCHAR(20) NOT NULL,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
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
CREATE INDEX idx_call_logs_team ON call_logs(team_id);
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
-- Row Level Security (RLS)
-- =====================================================
-- 이 앱은 현재 로그인(Auth)이 없고 프론트엔드에서 anon key 로
-- 직접 테이블을 읽고 쓴다. RLS 를 활성화하되 anon/authenticated 에
-- 전체 권한을 주는 정책을 명시적으로 둔다.
--
-- ⚠️  운영 배포 전에는 반드시 정책을 조직/역할 기반으로 좁혀야 한다.
--     (예: 로그인 사용자만, 본인 팀 데이터만 접근)
-- =====================================================

ALTER TABLE teams        ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE consult_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dev_all_access" ON teams        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_all_access" ON sales_agents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_all_access" ON customers    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_all_access" ON call_logs    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_all_access" ON consult_logs FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- 샘플 시드 데이터
-- =====================================================

INSERT INTO teams (name, code, is_active) VALUES
  ('영업1팀', 'SALES-1', true),
  ('영업2팀', 'SALES-2', true),
  ('CS팀',   'CS',      true);

INSERT INTO sales_agents (team_id, name, phone, priority, is_active)
SELECT t.id, a.name, a.phone, a.priority, true
FROM teams t
CROSS JOIN LATERAL (
  VALUES
    ('샘플 영업사원1', '010-0000-0001', 1),
    ('샘플 영업사원2', '010-0000-0002', 2)
) AS a(name, phone, priority)
WHERE t.code = 'SALES-1';

INSERT INTO sales_agents (team_id, name, phone, priority, is_active)
SELECT t.id, a.name, a.phone, a.priority, true
FROM teams t
CROSS JOIN LATERAL (
  VALUES
    ('샘플 영업사원3', '010-0000-0003', 1)
) AS a(name, phone, priority)
WHERE t.code = 'SALES-2';

-- 샘플 고객
INSERT INTO customers (name, phone, region, status, source, team_id)
SELECT '김철수', '010-9999-1111', '서울시', '상담중', '네이버광고', t.id
FROM teams t WHERE t.code = 'SALES-1';

INSERT INTO customers (name, phone, region, status, source, team_id)
SELECT '이미영', '010-9999-2222', '경기도', '신규', '직접방문', t.id
FROM teams t WHERE t.code = 'SALES-2';

INSERT INTO customers (name, phone, region, status, source)
VALUES ('박지훈', '010-9999-3333', '인천시', '신규', '홈페이지');
