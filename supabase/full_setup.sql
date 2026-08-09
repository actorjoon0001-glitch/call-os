-- =====================================================
-- CALL-OS 전체 스키마 1회 설치 스크립트 (세움디자인하우징)
-- 빈/부분 DB에서 안전하게 실행되도록 IF NOT EXISTS / ON CONFLICT 사용.
-- Supabase SQL Editor에 전체 붙여넣고 Run. (RLS 창 뜨면 "Run without RLS")
-- =====================================================

create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

-- 1. 팀/전시장 ------------------------------------------------
create table if not exists teams (
  id uuid default gen_random_uuid() primary key,
  name varchar(100) not null,
  code varchar(20) not null unique,
  manager_name varchar(50),
  manager_phone varchar(20),
  is_active boolean default true,
  created_at timestamptz default now()
);
-- 기존 설치 환경 호환: 컬럼 없으면 추가
alter table teams add column if not exists manager_name varchar(50);
alter table teams add column if not exists manager_phone varchar(20);

-- 2. 영업사원/전시장 담당 -------------------------------------
create table if not exists sales_agents (
  id uuid default gen_random_uuid() primary key,
  team_id uuid not null references teams(id) on delete cascade,
  name varchar(50) not null,
  phone varchar(20) not null,
  priority integer not null default 1,
  is_active boolean default true,
  created_at timestamptz default now()
);
create index if not exists idx_agents_team on sales_agents(team_id);
create index if not exists idx_agents_team_priority on sales_agents(team_id, priority);

-- 3. 고객 -----------------------------------------------------
create table if not exists customers (
  id uuid default gen_random_uuid() primary key,
  name varchar(100),
  phone varchar(20) not null,
  region varchar(50),
  content text,
  manager varchar(100),
  status varchar(20) default '신규' check (status in ('신규','상담중','계약','보류')),
  memo text,
  source varchar(50),
  team_id uuid references teams(id) on delete set null,
  created_at timestamptz default now()
);
create unique index if not exists idx_customers_phone on customers(phone);
create index if not exists idx_customers_status on customers(status);
create index if not exists idx_customers_team on customers(team_id);

-- 4. 통화 로그 ------------------------------------------------
create table if not exists call_logs (
  id uuid default gen_random_uuid() primary key,
  customer_phone varchar(20) not null,
  team_id uuid references teams(id) on delete set null,
  selected_menu varchar(10),
  call_status varchar(20) default 'ringing'
    check (call_status in ('ringing','answered','missed','failed','voicemail')),
  answered_by_agent_id uuid references sales_agents(id) on delete set null,
  ring_attempt_count integer default 0,
  broadcast_triggered boolean default false,
  answer_duration integer,
  note text,
  created_at timestamptz default now()
);
create index if not exists idx_call_logs_phone on call_logs(customer_phone);
create index if not exists idx_call_logs_team on call_logs(team_id);
create index if not exists idx_call_logs_status on call_logs(call_status);
create index if not exists idx_call_logs_created on call_logs(created_at desc);

-- 5. 상담 이력 ------------------------------------------------
create table if not exists consult_logs (
  id uuid default gen_random_uuid() primary key,
  customer_id uuid not null references customers(id) on delete cascade,
  manager varchar(100),
  content text,
  memo text,
  created_at timestamptz default now()
);
create index if not exists idx_consult_logs_customer on consult_logs(customer_id);

-- 6. 방문예약 -------------------------------------------------
create table if not exists reservations (
  id uuid default gen_random_uuid() primary key,
  customer_id uuid references customers(id) on delete set null,
  customer_phone varchar(20) not null,
  customer_name varchar(100),
  team_id uuid references teams(id) on delete set null,
  preferred_date date,
  preferred_time varchar(30),
  purpose text,
  status varchar(20) default '요청' check (status in ('요청','확정','취소','방문완료','노쇼')),
  source varchar(50) default 'AI안내원',
  memo text,
  call_sid varchar(64),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_reservations_phone on reservations(customer_phone);
create index if not exists idx_reservations_status on reservations(status);
create index if not exists idx_reservations_created on reservations(created_at desc);
drop trigger if exists trg_reservations_updated on reservations;
create trigger trg_reservations_updated before update on reservations
  for each row execute function set_updated_at();

-- 7. AI 통화 세션 --------------------------------------------
create table if not exists ai_call_sessions (
  id uuid default gen_random_uuid() primary key,
  call_sid varchar(64) not null unique,
  customer_phone varchar(20),
  team_id uuid references teams(id) on delete set null,
  transcript jsonb default '[]'::jsonb,
  intent varchar(30),
  outcome varchar(30) default 'in_progress'
    check (outcome in ('in_progress','booked','transferred','ended','failed')),
  turn_count integer default 0,
  reservation_id uuid references reservations(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_ai_sessions_created on ai_call_sessions(created_at desc);
drop trigger if exists trg_ai_sessions_updated on ai_call_sessions;
create trigger trg_ai_sessions_updated before update on ai_call_sessions
  for each row execute function set_updated_at();

-- 8. AI 안내원 설정 (단일 행) --------------------------------
create table if not exists ai_settings (
  id integer primary key default 1 check (id = 1),
  company_name varchar(100) default '세움디자인하우징',
  greeting text default '유튜브 보고 연락 주셨나요? 방문 상담 예약 도와드릴게요.',
  persona text default '친절하고 밝은 하우징 쇼룸 방문 상담 안내원. 존댓말을 쓰고 한 번에 하나씩 질문한다. 고객이 유튜브나 온라인에서 특정 평형·모델을 봤다고 하면 그 관심 평형(예: 20평)을 반드시 확인해 방문 목적에 기록한다. 세움디자인하우징은 전국 6개 전시장(김포 본점·제1·제3, 강화, 안동, 광주)을 운영하므로, 고객이 방문을 원하면 어느 지역/전시장 방문을 원하는지 물어 가장 가까운 전시장으로 안내하고 선택한 전시장을 방문 목적에 함께 기록한다. 매장 방문 상담 예약을 목표로 성함 → 관심 평형/모델 → 희망 전시장 → 희망 날짜 → 희망 시간 순으로 부드럽게 유도한다.',
  business_hours varchar(100) default '매일 09:00 ~ 18:00',
  address text default E'전국 6개 전시장 운영\n· 본점: 경기 김포시 김포대로 2295\n· 제1전시장: 경기 김포시 통진읍 조강로 164\n· 제3전시장: 경기 김포시 월곶면 포내리 162-12\n· 강화전시장: 인천 강화군 길상면 길상로 311\n· 안동전시장: 경북 안동시 이천동 860-8\n· 광주전시장: 광주 광산구 임곡동 476',
  booking_enabled boolean default true,
  fallback_to_human boolean default true,
  max_turns integer default 8,
  updated_at timestamptz default now()
);
drop trigger if exists trg_ai_settings_updated on ai_settings;
create trigger trg_ai_settings_updated before update on ai_settings
  for each row execute function set_updated_at();

insert into ai_settings (id) values (1) on conflict (id) do nothing;

-- 9. 실제 데이터 시드: 6개 전시장 + 담당 번호 -----------------
insert into teams (name, code, manager_phone, is_active) values
  ('본점',       'SEUM-BON', '010-9100-5945', true),
  ('제1전시장',  'SEUM-1',   '010-8190-5946', true),
  ('제3전시장',  'SEUM-3',   '010-2278-2997', true),
  ('강화전시장', 'SEUM-GH',  '010-8165-5945', true),
  ('안동전시장', 'SEUM-AD',  '010-4224-5945', true),
  ('광주전시장', 'SEUM-GJ',  '010-6639-5151', true)
on conflict (code) do nothing;

insert into sales_agents (team_id, name, phone, priority, is_active)
select t.id, v.name, v.phone, 1, true
from teams t
join (values
  ('SEUM-BON', '본점 담당',       '010-9100-5945'),
  ('SEUM-1',   '제1전시장 담당',  '010-8190-5946'),
  ('SEUM-3',   '제3전시장 담당',  '010-2278-2997'),
  ('SEUM-GH',  '강화전시장 담당', '010-8165-5945'),
  ('SEUM-AD',  '안동전시장 담당', '010-4224-5945'),
  ('SEUM-GJ',  '광주전시장 담당', '010-6639-5151')
) as v(code, name, phone) on v.code = t.code
where not exists (select 1 from sales_agents sa where sa.phone = v.phone);
