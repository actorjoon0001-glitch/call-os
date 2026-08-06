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
    if (provided !== secret) {
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
  return { statusCode: 200, headers: CORS, body: JSON.stringify(result) }
}
