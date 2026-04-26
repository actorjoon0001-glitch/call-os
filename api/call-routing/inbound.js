/**
 * CALL-OS 인바운드 콜 웹훅 핸들러
 *
 * 이 파일은 서버리스 함수(Supabase Edge Function, Vercel Serverless, AWS Lambda 등)로
 * 배포하여 통신사 웹훅을 받는 엔드포인트입니다.
 *
 * 통신사별 페이로드 형식 차이는 adapters/ 폴더의 어댑터들이 흡수합니다.
 * 환경변수 TELEPHONY_PROVIDER 로 어댑터를 선택할 수 있습니다.
 *
 * ───────────────────────────────────────
 * 흐름도:
 *
 * [고객 → 대표번호] → POST /api/call-routing/inbound
 *   → ARS 안내 멘트 재생 + 메뉴 입력 대기
 *   → POST /api/call-routing/menu-select
 *   → 순차 연결 시작 (1순위 영업사원)
 *   → POST /api/call-routing/status-callback
 *   → 부재중이면 다음 영업사원 → 전체 동시 울림 → 통화 로그 저장
 * ───────────────────────────────────────
 */

import { createClient } from '@supabase/supabase-js'
import { getAdapter } from './adapters/index.js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const COMPANY_NAME = process.env.COMPANY_NAME || '안내'
const RING_TIMEOUT = parseInt(process.env.RING_TIMEOUT_SECONDS || '15', 10)

const adapter = getAdapter()

// ──────────────────────────────────────────────
// 활성 팀 조회 + ARS 멘트/메뉴 동적 생성
// ──────────────────────────────────────────────
async function fetchActiveTeams() {
  const { data } = await supabase
    .from('teams')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
  return data || []
}

function buildGreeting(teams) {
  const lines = [
    `안녕하세요, ${COMPANY_NAME}입니다.`,
    '원하시는 메뉴 번호를 눌러주세요.',
  ]
  teams.forEach((t, idx) => {
    lines.push(`${idx + 1}번 ${t.name},`)
  })
  return lines.join(' ')
}

function buildMenu(teams) {
  const menu = {}
  teams.forEach((t, idx) => {
    menu[String(idx + 1)] = t
  })
  return menu
}

// ──────────────────────────────────────────────
// 1단계: 인바운드 콜 수신 → ARS 멘트 재생
// ──────────────────────────────────────────────
export async function handleInbound(req) {
  const { callerPhone } = adapter.parseInbound(req)

  // 발신자 정보 즉시 DB에 확보 (메뉴 선택 전에라도 끊겼을 때 추적 가능)
  if (callerPhone) {
    await ensureCustomerExists(callerPhone)
  }

  const teams = await fetchActiveTeams()

  if (teams.length === 0) {
    return adapter.buildSayAndHangup('현재 운영 중인 상담팀이 없습니다. 잠시 후 다시 이용해 주세요.')
  }

  return adapter.buildIVRResponse({
    greeting: buildGreeting(teams),
    actionUrl: '/api/call-routing/menu-select',
    retryUrl: '/api/call-routing/inbound',
    timeoutSec: 10,
  })
}

// ──────────────────────────────────────────────
// 2단계: 메뉴 선택 → 순차 연결 시작
// ──────────────────────────────────────────────
export async function handleMenuSelect(req) {
  const { digits, callerPhone } = adapter.parseMenuSelect(req)

  const teams = await fetchActiveTeams()
  const menu = buildMenu(teams)
  const selectedTeam = menu[digits]

  if (!selectedTeam) {
    return adapter.buildRetry('잘못된 입력입니다.', '/api/call-routing/inbound')
  }

  // 영업사원 조회 (우선순위순)
  const { data: agents } = await supabase
    .from('sales_agents')
    .select('*')
    .eq('team_id', selectedTeam.id)
    .eq('is_active', true)
    .order('priority', { ascending: true })

  if (!agents || agents.length === 0) {
    return adapter.buildSayAndHangup('현재 상담 가능한 직원이 없습니다.')
  }

  // 통화 로그 미리 생성
  const { data: callLog } = await supabase
    .from('call_logs')
    .insert({
      customer_phone: callerPhone,
      team_id: selectedTeam.id,
      selected_menu: selectedTeam.code,
      call_status: 'ringing',
      ring_attempt_count: 1,
    })
    .select()
    .single()

  const firstAgent = agents[0]
  const remainingAgentIds = agents.slice(1).map(a => a.id).join(',')

  const params = new URLSearchParams({
    callLogId: callLog?.id || '',
    teamId: selectedTeam.id,
    remainingAgents: remainingAgentIds,
    attemptCount: '1',
    agentId: firstAgent.id,
  })

  return adapter.buildDialSingle({
    message: `${selectedTeam.name}으로 연결합니다. 잠시만 기다려 주세요.`,
    phone: firstAgent.phone,
    callerId: callerPhone,
    timeoutSec: RING_TIMEOUT,
    statusCallbackUrl: `/api/call-routing/status-callback?${params.toString()}`,
  })
}

// ──────────────────────────────────────────────
// 3단계: 연결 결과 콜백 → 다음 담당자 or 전체 동시 울림
// ──────────────────────────────────────────────
export async function handleStatusCallback(req) {
  const { status, callerPhone } = adapter.parseDialStatus(req)
  const {
    callLogId,
    teamId,
    remainingAgents,
    attemptCount,
    agentId,
  } = req.query || {}

  const count = parseInt(attemptCount) || 1

  // 응답 성공
  if (status === 'completed' || status === 'answered') {
    await supabase
      .from('call_logs')
      .update({
        call_status: 'answered',
        answered_by_agent_id: agentId,
        ring_attempt_count: count,
      })
      .eq('id', callLogId)

    await upsertCustomerFromCall(callerPhone, teamId, agentId)
    return adapter.buildHangup()
  }

  // 미응답 → 다음 담당자 or 전체 동시 울림
  const remaining = remainingAgents ? remainingAgents.split(',').filter(Boolean) : []

  if (remaining.length > 0) {
    const nextAgentId = remaining[0]
    const nextRemaining = remaining.slice(1).join(',')

    const { data: nextAgent } = await supabase
      .from('sales_agents')
      .select('phone')
      .eq('id', nextAgentId)
      .single()

    await supabase
      .from('call_logs')
      .update({ ring_attempt_count: count + 1 })
      .eq('id', callLogId)

    const params = new URLSearchParams({
      callLogId,
      teamId,
      remainingAgents: nextRemaining,
      attemptCount: String(count + 1),
      agentId: nextAgentId,
    })

    return adapter.buildDialSingle({
      phone: nextAgent?.phone,
      callerId: callerPhone,
      timeoutSec: RING_TIMEOUT,
      statusCallbackUrl: `/api/call-routing/status-callback?${params.toString()}`,
    })
  }

  // 전체 동시 울림
  const { data: allAgents } = await supabase
    .from('sales_agents')
    .select('*')
    .eq('team_id', teamId)
    .eq('is_active', true)

  await supabase
    .from('call_logs')
    .update({
      ring_attempt_count: count + 1,
      broadcast_triggered: true,
    })
    .eq('id', callLogId)

  const params = new URLSearchParams({ callLogId, teamId })

  return adapter.buildDialBroadcast({
    phones: (allAgents || []).map(a => a.phone),
    callerId: callerPhone,
    timeoutSec: RING_TIMEOUT * 2,
    statusCallbackUrl: `/api/call-routing/broadcast-callback?${params.toString()}`,
  })
}

// ──────────────────────────────────────────────
// 4단계: 동시 울림 결과 콜백
// ──────────────────────────────────────────────
export async function handleBroadcastCallback(req) {
  const { status, callerPhone } = adapter.parseDialStatus(req)
  const { callLogId, teamId } = req.query || {}

  if (status === 'completed' || status === 'answered') {
    await supabase
      .from('call_logs')
      .update({ call_status: 'answered' })
      .eq('id', callLogId)

    await upsertCustomerFromCall(callerPhone, teamId, null)
  } else {
    await supabase
      .from('call_logs')
      .update({ call_status: 'missed' })
      .eq('id', callLogId)

    // 부재중이라도 발신자 정보는 DB에 확보 → 영업사원이 후속 콜백 가능
    await upsertCustomerFromCall(callerPhone, teamId, null)
  }

  return adapter.buildHangup()
}

// ──────────────────────────────────────────────
// 발신자 정보를 customers 테이블에 미리 확보 (전화번호만이라도)
// ──────────────────────────────────────────────
async function ensureCustomerExists(phone) {
  if (!phone) return
  const { data: existing } = await supabase
    .from('customers')
    .select('id')
    .eq('phone', phone)
    .maybeSingle()

  if (!existing) {
    await supabase.from('customers').insert({
      phone,
      status: '신규',
      source: '인바운드콜',
    })
  }
}

// ──────────────────────────────────────────────
// 통화 결과 기반 고객 정보 갱신
// ──────────────────────────────────────────────
async function upsertCustomerFromCall(phone, teamId, agentId) {
  if (!phone) return

  const { data: existing } = await supabase
    .from('customers')
    .select('id')
    .eq('phone', phone)
    .maybeSingle()

  let agentName = null
  if (agentId) {
    const { data: agent } = await supabase
      .from('sales_agents')
      .select('name')
      .eq('id', agentId)
      .single()
    agentName = agent?.name
  }

  if (existing) {
    const updates = {}
    if (teamId) updates.team_id = teamId
    if (agentName) updates.manager = agentName
    if (Object.keys(updates).length > 0) {
      await supabase.from('customers').update(updates).eq('id', existing.id)
    }
  } else {
    await supabase.from('customers').insert({
      phone,
      status: '신규',
      team_id: teamId,
      manager: agentName,
      source: '인바운드콜',
    })
  }
}
