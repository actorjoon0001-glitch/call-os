/**
 * 방문예약 저장 엔드포인트 (Netlify Function)
 *
 * 외부 전화 시스템이 HTTP로 예약을 저장할 때 사용하는 단순 엔드포인트.
 * (실시간 연동은 mcp.js 의 MCP 도구를 권장 — 이 엔드포인트는 범용 HTTP 백업)
 *
 * 요청 (POST): 헤더 x-webhook-secret, 바디 { name, phone, date, time, purpose, showroom, interested_size, memo }
 * 응답: { ok, id } | { ok:false, error }
 * 필요 env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESERVATION_WEBHOOK_SECRET(선택)
 */

import { insertReservation } from '../../api/lib/reservations.js'
import { resolveTeam, notifyManager } from '../../api/lib/notify.js'
import { sbUpdate } from '../../api/lib/supabase-rest.js'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ ok: false, error: 'POST만 지원' }) }
  }

  const secret = process.env.RESERVATION_WEBHOOK_SECRET
  if (secret) {
    const provided = event.headers['x-webhook-secret'] || event.headers['X-Webhook-Secret']
    // 토큰이 제공됐는데 틀린 경우만 거부 (앱 내부 호출은 토큰 없이 허용)
    if (provided && provided !== secret) {
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ ok: false, error: '인증 실패' }) }
    }
  }

  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ ok: false, error: '잘못된 JSON' }) }
  }

  const result = await insertReservation(body)

  // 예약 저장 성공 시 담당 전시장 매칭 + 팀장 문자
  if (result.ok && body.notify !== false) {
    try {
      const team = await resolveTeam(body.showroom)
      if (team?.id && result.id) {
        await sbUpdate('reservations', `id=eq.${result.id}`, { team_id: team.id }).catch(() => {})
      }
      await notifyManager(team, body)
    } catch (e) {
      console.error('[save-reservation] 팀장 알림 실패:', e.message)
    }
  }

  return { statusCode: 200, headers: CORS, body: JSON.stringify(result) }
}
