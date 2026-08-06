/**
 * 방문예약 저장 엔드포인트 (Netlify Function)
 *
 * 외부 전화 시스템(ClawOps AI 에이전트의 function calling / 웹훅 등)이
 * 통화 중 수집한 방문예약 정보를 CALL-OS DB(reservations)에 저장할 때 호출한다.
 * 프론트는 Supabase anon 키로 직접 쓰지만, 외부 시스템은 Supabase 접근 권한이
 * 없으므로 이 엔드포인트가 service_role로 대신 기록한다.
 *
 * 요청 (POST /.netlify/functions/save-reservation):
 *   헤더: x-webhook-secret: <RESERVATION_WEBHOOK_SECRET>   (env 설정 시 필수)
 *   바디: {
 *     name, phone, date, time, purpose, showroom, interested_size, memo
 *   }
 * 응답: { ok: true, id } 또는 { ok:false, error }
 *
 * 필요 환경변수(Netlify):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   RESERVATION_WEBHOOK_SECRET (선택, 설정 시 헤더 검증)
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

// "YYYY-MM-DD" 만 date 컬럼에 저장, 그 외 자연어는 preferred_time으로 흡수
function splitDateTime(date, time) {
  const isIsoDate = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
  return {
    preferred_date: isIsoDate ? date : null,
    // date가 자연어("이번 주 토요일")면 time과 합쳐 시간 필드에 보존
    preferred_time: [!isIsoDate ? date : null, time].filter(Boolean).join(' ') || null,
  }
}

// 관심 평형/전시장 등 스키마에 없는 정보는 purpose에 자연스럽게 합친다
function buildPurpose({ purpose, showroom, interested_size }) {
  const parts = [
    interested_size && `관심 ${interested_size}`,
    showroom && `${showroom} 방문`,
    purpose,
  ].filter(Boolean)
  return parts.join(' / ') || null
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ ok: false, error: 'POST만 지원' }) }
  }

  // 시크릿 검증 (env 설정된 경우에만)
  const secret = process.env.RESERVATION_WEBHOOK_SECRET
  if (secret) {
    const provided = event.headers['x-webhook-secret'] || event.headers['X-Webhook-Secret']
    if (provided !== secret) {
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ ok: false, error: '인증 실패' }) }
    }
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ ok: false, error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정' }),
    }
  }

  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ ok: false, error: '잘못된 JSON' }) }
  }

  if (!body.phone && !body.name) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ ok: false, error: 'name 또는 phone 필요' }) }
  }

  const { preferred_date, preferred_time } = splitDateTime(body.date, body.time)
  const row = {
    customer_name: body.name || null,
    customer_phone: body.phone || '미상',
    preferred_date,
    preferred_time,
    purpose: buildPurpose(body),
    memo: body.memo || null,
    status: '요청',
    source: 'AI안내원(전화)',
  }

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/reservations`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(row),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: false, error: `DB 저장 실패 ${res.status}: ${detail}` }) }
    }
    const data = await res.json()
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, id: data?.[0]?.id || null }) }
  } catch (err) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: false, error: err.message }) }
  }
}
