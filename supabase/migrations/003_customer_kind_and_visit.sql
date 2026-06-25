-- =====================================================
-- CALL-OS: 고객 DB 통합 — 유입 구분(kind) + 방문예약일(visit_date)
-- 방문예약자와 CALL-OS 전화 유입 DB를 한 화면에서 모아 관리하기 위함
-- =====================================================

-- 1. 유입 구분 컬럼: 방문예약 / 전화유입(CALL-OS) / 직접등록
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT '직접등록'
    CHECK (kind IN ('방문예약', '전화유입', '직접등록'));

COMMENT ON COLUMN customers.kind IS '유입 구분: 방문예약/전화유입(CALL-OS)/직접등록';

-- 2. 방문 예약 일시 (kind = 방문예약 일 때 사용)
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS visit_date TIMESTAMPTZ;

COMMENT ON COLUMN customers.visit_date IS '방문 예약 일시 (방문예약 고객용)';

-- 3. 조회 인덱스
CREATE INDEX IF NOT EXISTS idx_customers_kind ON customers(kind);
CREATE INDEX IF NOT EXISTS idx_customers_visit_date ON customers(visit_date);

-- 4. 기존 데이터 보정: 유입경로(source)로 구분 추정
UPDATE customers SET kind = '전화유입'
  WHERE kind = '직접등록'
    AND source IS NOT NULL
    AND (source ILIKE '%전화%' OR source ILIKE '%콜%' OR source ILIKE '%call%');

UPDATE customers SET kind = '방문예약'
  WHERE kind = '직접등록'
    AND source IS NOT NULL
    AND source ILIKE '%방문%';

-- 5. 샘플 방문예약 시드 (데모용)
INSERT INTO customers (name, phone, region, status, source, kind, visit_date, team_id)
SELECT '방문예약 고객A', '010-7777-1001', '서울시', '신규', '방문예약', '방문예약',
       now() + interval '2 day', t.id
FROM teams t WHERE t.code = 'SALES-1'
ON CONFLICT (phone) DO NOTHING;

INSERT INTO customers (name, phone, region, status, source, kind)
VALUES ('CALL-OS 유입 고객B', '010-7777-1002', '경기도', '신규', '대표번호 수신', '전화유입')
ON CONFLICT (phone) DO NOTHING;
