-- =====================================================
-- CALL-OS: 회사·대표번호 통합 운영설정
-- 환경변수에 박혀있던 값을 DB로 옮겨 앱에서 직접 관리
-- =====================================================

CREATE TABLE company_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  company_name VARCHAR(100) NOT NULL DEFAULT '우리회사',
  main_phone VARCHAR(30),
  ars_greeting TEXT,
  ars_after_menu_message VARCHAR(200) DEFAULT '잠시만 기다려 주세요. 담당자를 연결해 드리겠습니다.',
  ars_no_agent_message VARCHAR(200) DEFAULT '현재 상담 가능한 직원이 없습니다. 잠시 후 다시 이용해 주세요.',
  ars_invalid_input_message VARCHAR(200) DEFAULT '잘못된 입력입니다. 다시 시도해 주세요.',
  ring_timeout_seconds INTEGER NOT NULL DEFAULT 15,
  max_sequential_attempts INTEGER NOT NULL DEFAULT 10,
  enable_broadcast_fallback BOOLEAN NOT NULL DEFAULT true,
  telephony_provider VARCHAR(20) NOT NULL DEFAULT 'twilio',
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE company_settings IS '회사 단위 통합 운영설정 (싱글톤: id=1 한 행만 존재)';
COMMENT ON COLUMN company_settings.main_phone IS '회사 대표번호 (인바운드 수신 + 발신 callerId)';
COMMENT ON COLUMN company_settings.ars_greeting IS 'ARS 인사말 (NULL이면 팀 목록 기반 자동 생성)';
COMMENT ON COLUMN company_settings.ring_timeout_seconds IS '담당자 1인당 벨 울림 타임아웃(초)';
COMMENT ON COLUMN company_settings.max_sequential_attempts IS '순차 연결 최대 시도 인원수';
COMMENT ON COLUMN company_settings.enable_broadcast_fallback IS '순차 실패 시 전체 동시 울림 사용 여부';

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION touch_company_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_company_settings_updated_at
BEFORE UPDATE ON company_settings
FOR EACH ROW EXECUTE FUNCTION touch_company_settings_updated_at();

-- 초기 row 생성
INSERT INTO company_settings (id, company_name) VALUES (1, '우리회사')
ON CONFLICT (id) DO NOTHING;
