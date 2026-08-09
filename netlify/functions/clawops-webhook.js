/**
 * ClawOps 통화 웹훅 수신기 (Netlify Function)
 *
 * 통화가 끝나면 ClawOps가 보내는 이벤트(call.completed / transcript.completed /
 * summary.completed)를 받아 CALL-OS에 기록한다:
 *   1) ai_call_sessions — 대화 전문(트랜스크립트) + 통화 세션 (AI 안내원 화면에 표시)
 *   2) call_logs        — "전화가 왔다"는 통화 기록 (대시보드 집계)
 *   3) reservations     — 대화에서 방문예약 의사가 확인되면 자동 생성
 *
 * ClawOps에 등록할 주소 예:
 *   https://call-os.netlify.app/.netlify/functions/clawops-webhook?token=<RESERVATION_WEBHOOK_SECRET>
 *
 * 필요 env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY(예약 추출용),
 *          RESERVATION_WEBHOOK_SECRET(선택, ?token= 검증)
 *
 * 다양한 payload 형태에 견디도록 필드명을 방어적으로 탐색한다.
 */

import { sbConfigured, sbSelect, sbInsert, sbUpdate } from '../../api/lib/supabase-rest.js'
import { insertReservation } from '../../api/lib/reservations.js'
import { callClaude } from '../../api/lib/claude.js'
import { sendSms, solapiConfigured } from '../../api/lib/solapi.js'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

function first(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k]
  }
  return undefined
}

// 다양한 트랜스크립트 형태 → [{role:'user'|'assistant', content}]
function normalizeTranscript(raw) {
  if (!raw) return []
  let arr = raw
  if (typeof raw === 'string') {
    try { arr = JSON.parse(raw) } catch { return [{ role: 'assistant', content: raw }] }
  }
  if (!Array.isArray(arr)) return []
  return arr.map(t => {
    const roleRaw = String(first(t, ['role', 'speaker', 'from', 'party']) || '').toLowerCase()
    const isUser = ['user', 'customer', 'caller', 'human', 'inbound', '고객'].some(r => roleRaw.includes(r))
    const content = first(t, ['content', 'text', 'message', 'transcript', 'value']) || ''
    return { role: isUser ? 'user' : 'assistant', content: String(content) }
  }).filter(t => t.content)
}

function transcriptToText(turns) {
  return turns.map(t => `${t.role === 'user' ? '고객' : '안내원'}: ${t.content}`).join('\n')
}

// 통화 상태 → call_logs.call_status
function mapCallStatus(status) {
  const s = String(status || '').toLowerCase()
  if (s.includes('complet') || s.includes('answer') || s.includes('end')) return 'answered'
  if (s.includes('miss') || s.includes('no-answer') || s.includes('noanswer')) return 'missed'
  if (s.includes('fail') || s.includes('busy') || s.includes('reject')) return 'failed'
  return 'answered'
}

// Claude로 대화에서 방문예약 추출
async function extractBooking(turns) {
  if (!process.env.ANTHROPIC_API_KEY || turns.length === 0) return { hasBooking: false }
  const system = `아래는 세움디자인하우징 전화 상담 대화입니다. 고객이 "매장 방문 상담 예약"을 했는지 판단하고 정보를 JSON 하나로만 출력하세요. 다른 텍스트 금지.
{"hasBooking": true, "name":"성함", "showroom":"희망 전시장", "interested_size":"관심 평형", "date":"YYYY-MM-DD 또는 자연어", "time":"희망시간", "purpose":"한줄요약"}
예약 의사가 분명하지 않으면 {"hasBooking": false} 만 출력하세요.`
  try {
    const text = await callClaude({
      system,
      messages: [{ role: 'user', content: transcriptToText(turns) }],
      maxTokens: 400,
    })
    const s = text.indexOf('{'); const e = text.lastIndexOf('}')
    if (s !== -1 && e > s) {
      return JSON.parse(text.slice(s, e + 1))
    }
    return { hasBooking: false }
  } catch (err) {
    console.error('[clawops-webhook] 예약 추출 실패:', err.message)
    return { hasBooking: false }
  }
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: JSON_HEADERS, body: '' }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ ok: false, error: 'POST only' }) }
  }

  // 선택적 토큰 검증
  const secret = process.env.RESERVATION_WEBHOOK_SECRET
  if (secret) {
    const q = event.queryStringParameters || {}
    if (q.token !== secret) {
      return { statusCode: 401, headers: JSON_HEADERS, body: JSON.stringify({ ok: false, error: 'unauthorized' }) }
    }
  }

  if (!sbConfigured()) {
    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ ok: false, error: 'SUPABASE 미설정' }) }
  }

  let body
  try { body = JSON.parse(event.body || '{}') } catch {
    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ ok: false, error: 'bad json' }) }
  }

  const type = first(body, ['type', 'event', 'event_type']) || 'unknown'
  const data = body.data || body.payload || body

  const callId = String(first(data, ['call_id', 'callId', 'id', 'sid', 'call_sid', 'callSid']) || `clawops-${type}-${(body.created_at || body.timestamp || '')}`)
  const fromNum = first(data, ['from', 'from_', 'caller', 'customer_phone', 'source', 'ani'])
  const status = first(data, ['status', 'call_status', 'state', 'result'])
  const duration = first(data, ['duration', 'duration_seconds', 'call_duration'])
  const summary = first(data, ['summary', 'summary_text'])
  const turns = normalizeTranscript(first(data, ['transcript', 'messages', 'turns', 'conversation', 'dialogue']))

  try {
    // 세션 조회 (call_sid 기준)
    const existing = await sbSelect('ai_call_sessions', `call_sid=eq.${encodeURIComponent(callId)}&select=*`)
    const session = existing[0]

    if (!session) {
      // 첫 이벤트 → 세션 + 통화기록 생성
      const created = await sbInsert('ai_call_sessions', {
        call_sid: callId,
        customer_phone: fromNum || null,
        transcript: turns,
        intent: turns.length ? '예약' : null,
        outcome: 'ended',
      })
      await sbInsert('call_logs', {
        customer_phone: fromNum || '미상',
        call_status: mapCallStatus(status),
        answer_duration: duration ? parseInt(duration, 10) || null : null,
        note: summary || 'AI 안내원 통화',
      }).catch(e => console.error('[clawops-webhook] call_log 실패:', e.message))
      await maybeBook(created[0], turns, fromNum)
    } else {
      // 후속 이벤트 → 트랜스크립트/요약 보강
      const patch = {}
      if (turns.length) patch.transcript = turns
      if (summary) patch.note = summary
      if (Object.keys(patch).length) {
        await sbUpdate('ai_call_sessions', `id=eq.${session.id}`, patch)
      }
      await maybeBook(session, turns.length ? turns : (session.transcript || []), fromNum || session.customer_phone)
    }

    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ ok: true, type, callId }) }
  } catch (err) {
    console.error('[clawops-webhook] 처리 오류:', err.message)
    // 웹훅은 200으로 응답해 ClawOps 재시도 폭주를 막되, 오류는 로그로 남긴다
    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ ok: false, error: err.message }) }
  }
}

// 예약 의사가 확인되면 1회만 방문예약 생성 + 담당 전시장 팀장에게 문자
async function maybeBook(session, turns, fromNum) {
  if (!session || session.reservation_id) return // 이미 예약 생성됨
  if (!turns || turns.length === 0) return

  const booking = await extractBooking(turns)
  if (!booking || !booking.hasBooking || !booking.name) return

  const phone = fromNum || session.customer_phone || ''
  const saved = await insertReservation({
    name: booking.name,
    phone,
    showroom: booking.showroom,
    interested_size: booking.interested_size,
    date: booking.date,
    time: booking.time,
    purpose: booking.purpose,
    source: 'AI안내원(전화)',
  })

  if (!saved.ok) return

  // 담당 전시장 매칭 + 세션 갱신
  const team = await resolveTeam(booking.showroom)
  await sbUpdate('ai_call_sessions', `id=eq.${session.id}`, {
    reservation_id: saved.id,
    outcome: 'booked',
    intent: '예약',
    team_id: team?.id || null,
  }).catch(() => {})
  if (team?.id) {
    await sbUpdate('reservations', `id=eq.${saved.id}`, { team_id: team.id }).catch(() => {})
  }

  // 담당 전시장 팀장에게 문자 발송
  await notifyManager(team, { ...booking, phone })
}

// 예약한 전시장명을 teams와 매칭 (이름 포함 / 지역 키워드)
async function resolveTeam(showroom) {
  try {
    const teams = await sbSelect('teams', 'select=*')
    if (!teams?.length) return null
    const s = String(showroom || '')
    // 1) 팀명이 예약 전시장 문자열에 포함되는지 (예: "안동전시장" ⊂ "안동전시장 방문")
    let hit = teams.find(t => s && (s.includes(t.name) || t.name.includes(s)))
    if (hit) return hit
    // 2) 지역 키워드 매칭
    const KEYS = [
      ['안동', '안동'], ['강화', '강화'], ['광주', '광주'],
      ['월곶', '제3'], ['통진', '제1'], ['본점', '본점'], ['김포', '본점'],
    ]
    for (const [kw, teamHint] of KEYS) {
      if (s.includes(kw)) {
        hit = teams.find(t => t.name.includes(teamHint))
        if (hit) return hit
      }
    }
    return null
  } catch {
    return null
  }
}

// 전시장 팀장에게 예약 알림 문자
async function notifyManager(team, booking) {
  if (!solapiConfigured()) return
  const managerPhone = team?.manager_phone
  if (!managerPhone) return

  const lines = [
    '[세움디자인하우징 방문예약]',
    `전시장: ${team?.name || booking.showroom || '-'}`,
    `성함: ${booking.name || '-'}`,
    `연락처: ${booking.phone || '-'}`,
    booking.interested_size && `관심: ${booking.interested_size}`,
    (booking.date || booking.time) && `희망: ${[booking.date, booking.time].filter(Boolean).join(' ')}`,
    'AI 안내원 접수 · CALL-OS에서 확인',
  ].filter(Boolean)

  const r = await sendSms({ to: managerPhone, text: lines.join('\n') })
  if (!r.ok) console.error('[clawops-webhook] 문자 발송 실패:', r.error)
}
