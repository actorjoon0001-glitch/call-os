/**
 * Supabase REST 공용 헬퍼 (서버리스 함수용, service_role)
 * PostgREST 엔드포인트에 select/insert/update 요청을 보낸다.
 */

const baseUrl = () => process.env.SUPABASE_URL
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY

export function sbConfigured() {
  return !!(baseUrl() && serviceKey())
}

function headers(extra = {}) {
  const k = serviceKey()
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', ...extra }
}

export async function sbSelect(table, query = '') {
  const res = await fetch(`${baseUrl()}/rest/v1/${table}?${query}`, { headers: headers() })
  if (!res.ok) throw new Error(`select ${table} ${res.status}: ${await res.text().catch(() => '')}`)
  return res.json()
}

export async function sbInsert(table, row) {
  const res = await fetch(`${baseUrl()}/rest/v1/${table}`, {
    method: 'POST',
    headers: headers({ Prefer: 'return=representation' }),
    body: JSON.stringify(row),
  })
  if (!res.ok) throw new Error(`insert ${table} ${res.status}: ${await res.text().catch(() => '')}`)
  return res.json()
}

export async function sbUpdate(table, query, patch) {
  const res = await fetch(`${baseUrl()}/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=representation' }),
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(`update ${table} ${res.status}: ${await res.text().catch(() => '')}`)
  return res.json()
}
