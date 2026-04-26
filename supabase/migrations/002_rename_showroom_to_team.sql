-- =====================================================
-- CALL-OS: 도메인 일반화 마이그레이션
-- 전시장(showroom) 개념을 일반 기업용 "팀(team)"으로 전환
-- =====================================================

-- 1. 테이블 이름 변경: showrooms → teams
ALTER TABLE showrooms RENAME TO teams;

-- 2. 컬럼 이름 변경: sales_agents.showroom_id → team_id
ALTER TABLE sales_agents RENAME COLUMN showroom_id TO team_id;

-- 3. 컬럼 이름 변경: customers.showroom_id → team_id
ALTER TABLE customers RENAME COLUMN showroom_id TO team_id;

-- 4. 컬럼 이름 변경: call_logs.showroom_id → team_id
ALTER TABLE call_logs RENAME COLUMN showroom_id TO team_id;

-- 5. 인덱스 이름 변경 (Postgres에서는 자동으로 따라가지 않으므로 명시)
ALTER INDEX idx_agents_showroom RENAME TO idx_agents_team;
ALTER INDEX idx_agents_priority RENAME TO idx_agents_team_priority;
ALTER INDEX idx_customers_showroom RENAME TO idx_customers_team;
ALTER INDEX idx_call_logs_showroom RENAME TO idx_call_logs_team;

-- 6. 코멘트 갱신
COMMENT ON TABLE teams IS '팀/지점/부서 정보 (기업별 라우팅 단위)';
COMMENT ON COLUMN teams.name IS '팀명 (회사 설정에 따라 "팀/지점/부서"로 라벨링)';
COMMENT ON COLUMN teams.code IS '팀 코드 (ARS 메뉴 매핑용, 예: SALES-1)';

-- 7. 시드 데이터 정리: 기존 세움건설 전용 시드 제거
DELETE FROM call_logs;
DELETE FROM consult_logs;
DELETE FROM customers;
DELETE FROM sales_agents;
DELETE FROM teams;

-- 8. 일반 기업용 샘플 시드
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
