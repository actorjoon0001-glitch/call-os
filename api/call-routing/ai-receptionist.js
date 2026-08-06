/**
 * CALL-OS AI 안내원 (방문예약 유도)
 *
 * 대표번호로 걸려온 전화를 AI가 응대하여 자연스러운 대화로 방문예약을 유도한다.
 * 통신사(Twilio)의 음성 인식(STT)으로 고객 발화를 받고, Claude가 다음 안내를
 * 생성한다. 대화 상태는 call_sid 기준으로 ai_call_sessions 테이블에 누적된다.
 *
 * ───────────────────────────────────────
 * 흐름:
 *  [고객 → 대표번호] → POST /api/call-routing/ai-inbound
 *    → 인사 + 음성 응답 수집(<Gather speech>)
 *  → POST /api/call-routing/ai-turn  (발화 전사 결과 도착)
 *    → Claude 응대 생성 → action 분기
 *       - continue : 다시 음성 수집
 *       - book     : 방문예약 저장 후 종료
 *       - transfer : 기존 ARS 메뉴(/inbound)로 사람 연결
 *       - goodbye  : 종료
 * ───────────────────────────────────────
 */

import { createClient } from '@supabase/supabase-js'
import { getAdapter } from './adapters/index.js'
import { runReceptionistTurn } from '../lib/claude.js'
import { buildSystemPrompt, normalizeSettings, toMessages } from '../lib/receptionist-prompt.js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const adapter = getAdapter()

const AI_INBOUND_URL = '/api/call-routing/ai-inbound'
const AI_TURN_URL = '/api/call-routing/ai-turn'
const HUMAN_MENU_URL = '/api/call-routing/inbound'

// ──────────────────────────────────────────────
// 설정 로드 (없으면 안전한 기본값)
// ──────────────────────────────────────────────
async function fetchSettings() {
  const { data } = await supabase.from('ai_settings').select('*').eq('id', 1).maybeSingle()
  return normalizeSettings({
    ...data,
    company_name: data?.company_name || process.env.COMPANY_NAME,
  })
}

// ──────────────────────────────────────────────
// 세션 로드/생성 (call_sid 기준)
// ──────────────────────────────────────────────
async function loadOrCreateSession(callSid, callerPhone) {
  const { data: existing } = await supabase
    .from('ai_call_sessions')
    .select('*')
    .eq('call_sid', callSid)
    .maybeSingle()

  if (existing) return existing

  const { data: created } = await supabase
    .from('ai_call_sessions')
    .insert({
      call_sid: callSid,
      customer_phone: callerPhone,
      transcript: [],
      outcome: 'in_progress',
      turn_count: 0,
    })
    .select()
    .single()

  return created
}

// ──────────────────────────────────────────────
// 1단계: AI 인바운드 → 인사 + 음성 수집
// ──────────────────────────────────────────────
export async function handleAiInbound(req) {
  const { callerPhone, callSid } = adapter.parseInbound(req)
  const settings = await fetchSettings()

  if (callerPhone) await ensureCustomerExists(callerPhone)

  // AI 응대가 꺼져 있으면 기존 ARS 메뉴로 위임
  if (!settings.booking_enabled) {
    return adapter.buildSayAndRedirect({ message: '', redirectUrl: HUMAN_MENU_URL })
  }

  if (callSid) {
    const session = await loadOrCreateSession(callSid, callerPhone)
    const greetingTurn = { role: 'assistant', content: settings.greeting, ts: new Date().toISOString() }
    await supabase
      .from('ai_call_sessions')
      .update({ transcript: [...(session.transcript || []), greetingTurn] })
      .eq('id', session.id)
  }

  return adapter.buildSayAndGatherSpeech({
    message: `안녕하세요, ${settings.company_name}입니다. ${settings.greeting}`,
    actionUrl: AI_TURN_URL,
    repromptUrl: AI_INBOUND_URL,
  })
}

// ──────────────────────────────────────────────
// 2단계: 발화 결과 → Claude 응대 → 액션 분기
// ──────────────────────────────────────────────
export async function handleAiTurn(req) {
  const { transcript, callerPhone, callSid } = adapter.parseSpeechResult(req)
  const settings = await fetchSettings()
  const session = await loadOrCreateSession(callSid, callerPhone)

  // 고객 발화 누적
  const history = session.transcript || []
  const userTurn = { role: 'user', content: transcript || '(무응답)', ts: new Date().toISOString() }
  const nextHistory = [...history, userTurn]
  const turnCount = (session.turn_count || 0) + 1

  // 최대 턴 초과 → 사람 연결(허용 시) 또는 종료
  if (turnCount > settings.max_turns) {
    await supabase
      .from('ai_call_sessions')
      .update({ transcript: nextHistory, turn_count: turnCount, outcome: settings.fallback_to_human ? 'transferred' : 'ended' })
      .eq('id', session.id)
    return settings.fallback_to_human
      ? adapter.buildSayAndRedirect({ message: '담당자에게 연결해 드리겠습니다.', redirectUrl: HUMAN_MENU_URL })
      : adapter.buildSayAndHangup('도움이 필요하시면 다시 전화 주세요. 감사합니다.')
  }

  // Claude 응대 생성 (실패 시 사람 연결 폴백)
  let result
  try {
    result = await runReceptionistTurn({
      system: buildSystemPrompt(settings),
      messages: toMessages(nextHistory),
    })
  } catch (err) {
    console.error('[AI-Receptionist] Claude 호출 실패:', err.message)
    await supabase
      .from('ai_call_sessions')
      .update({ transcript: nextHistory, turn_count: turnCount, outcome: 'failed' })
      .eq('id', session.id)
    return settings.fallback_to_human
      ? adapter.buildSayAndRedirect({ message: '담당자에게 연결해 드리겠습니다. 잠시만 기다려 주세요.', redirectUrl: HUMAN_MENU_URL })
      : adapter.buildSayAndHangup('죄송합니다. 잠시 후 다시 이용해 주세요.')
  }

  const assistantTurn = { role: 'assistant', content: result.say, ts: new Date().toISOString() }
  const finalHistory = [...nextHistory, assistantTurn]

  const baseUpdate = { transcript: finalHistory, turn_count: turnCount, intent: result.intent }

  // ── 액션 분기 ──
  if (result.action === 'book') {
    const reservationId = await saveReservation({
      callSid,
      callerPhone,
      teamId: session.team_id,
      booking: result.booking,
    })
    await supabase
      .from('ai_call_sessions')
      .update({ ...baseUpdate, outcome: 'booked', reservation_id: reservationId })
      .eq('id', session.id)
    return adapter.buildSayAndHangup(result.say || '방문 예약이 접수되었습니다. 감사합니다.')
  }

  if (result.action === 'transfer') {
    await supabase
      .from('ai_call_sessions')
      .update({ ...baseUpdate, outcome: settings.fallback_to_human ? 'transferred' : 'ended' })
      .eq('id', session.id)
    return settings.fallback_to_human
      ? adapter.buildSayAndRedirect({ message: result.say || '담당자에게 연결해 드리겠습니다.', redirectUrl: HUMAN_MENU_URL })
      : adapter.buildSayAndHangup(result.say || '감사합니다.')
  }

  if (result.action === 'goodbye') {
    await supabase
      .from('ai_call_sessions')
      .update({ ...baseUpdate, outcome: 'ended' })
      .eq('id', session.id)
    return adapter.buildSayAndHangup(result.say || '이용해 주셔서 감사합니다.')
  }

  // continue: 대화 이어가기
  await supabase.from('ai_call_sessions').update(baseUpdate).eq('id', session.id)
  return adapter.buildSayAndGatherSpeech({
    message: result.say,
    actionUrl: AI_TURN_URL,
    repromptUrl: AI_INBOUND_URL,
  })
}

// ──────────────────────────────────────────────
// 방문예약 저장 + 고객 연결
// ──────────────────────────────────────────────
async function saveReservation({ callSid, callerPhone, teamId, booking }) {
  const b = booking || {}

  // 고객 매칭/보강
  let customerId = null
  if (callerPhone) {
    const { data: customer } = await supabase
      .from('customers')
      .select('id, name')
      .eq('phone', callerPhone)
      .maybeSingle()

    if (customer) {
      customerId = customer.id
      if (!customer.name && b.name) {
        await supabase.from('customers').update({ name: b.name }).eq('id', customer.id)
      }
    } else {
      const { data: created } = await supabase
        .from('customers')
        .insert({ phone: callerPhone, name: b.name || null, status: '신규', source: 'AI안내원', team_id: teamId })
        .select('id')
        .single()
      customerId = created?.id
    }
  }

  const { data: reservation } = await supabase
    .from('reservations')
    .insert({
      customer_id: customerId,
      customer_phone: callerPhone,
      customer_name: b.name || null,
      team_id: teamId,
      preferred_date: normalizeDate(b.date),
      preferred_time: b.time || null,
      purpose: b.purpose || null,
      status: '요청',
      source: 'AI안내원',
      call_sid: callSid,
    })
    .select('id')
    .single()

  return reservation?.id || null
}

// "YYYY-MM-DD" 형식만 date 컬럼에 저장, 그 외 자연어는 null(시간 필드로 대체)
function normalizeDate(value) {
  if (!value) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

// ──────────────────────────────────────────────
// 발신자 정보를 customers 테이블에 미리 확보
// ──────────────────────────────────────────────
async function ensureCustomerExists(phone) {
  if (!phone) return
  const { data: existing } = await supabase
    .from('customers')
    .select('id')
    .eq('phone', phone)
    .maybeSingle()

  if (!existing) {
    await supabase.from('customers').insert({ phone, status: '신규', source: 'AI안내원' })
  }
}
