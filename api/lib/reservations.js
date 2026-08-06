/**
 * 방문예약 저장 공용 헬퍼 (서버리스 함수 공용)
 *
 * 외부 전화 시스템(ClawOps MCP 도구 / 웹훅 등)이 수집한 예약을 Supabase
 * reservations 테이블에 service_role 로 기록한다. save-reservation, mcp 함수가
 * 동일 로직을 쓰도록 한곳에서 관리.
 */

// "YYYY-MM-DD" 만 date 컬럼에 저장, 그 외 자연어는 preferred_time으로 흡수
export function splitDateTime(date, time) {
  const isIsoDate = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
  return {
    preferred_date: isIsoDate ? date : null,
    preferred_time: [!isIsoDate ? date : null, time].filter(Boolean).join(' ') || null,
  }
}

// 관심 평형/전시장 등 스키마에 없는 정보는 purpose에 자연스럽게 합친다
export function buildPurpose({ purpose, showroom, interested_size }) {
  const parts = [
    interested_size && `관심 ${interested_size}`,
    showroom && `${showroom} 방문`,
    purpose,
  ].filter(Boolean)
  return parts.join(' / ') || null
}

/**
 * 예약 1건 저장. 반환: { ok:true, id } | { ok:false, error }
 */
export async function insertReservation(body = {}) {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return { ok: false, error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정' }
  }
  if (!body.phone && !body.name) {
    return { ok: false, error: 'name 또는 phone 필요' }
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
    source: body.source || 'AI안내원(전화)',
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
      return { ok: false, error: `DB 저장 실패 ${res.status}: ${detail}` }
    }
    const data = await res.json()
    return { ok: true, id: data?.[0]?.id || null }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}
