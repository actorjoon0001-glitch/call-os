/**
 * CALL-OS 예약 MCP 서버 (Netlify Function, Streamable HTTP)
 *
 * ClawOps AI 에이전트의 "외부 도구 연결(MCP)"에 등록하면, 통화 중 AI가
 * save_reservation 도구를 호출해 방문예약을 CALL-OS(reservations)에 실시간 저장한다.
 *
 * ClawOps 콘솔에 넣을 MCP 서버 주소 예:
 *   https://call-os.netlify.app/.netlify/functions/mcp?token=<RESERVATION_WEBHOOK_SECRET>
 *
 * 상태 없는(stateless) Streamable HTTP 방식으로 JSON-RPC 요청에 application/json 으로 응답한다.
 * 필요 env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESERVATION_WEBHOOK_SECRET(선택)
 */

import { insertReservation } from '../../api/lib/reservations.js'

const PROTOCOL_VERSION = '2025-03-26'

const JSON_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, mcp-session-id',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Content-Type': 'application/json',
}

const SAVE_RESERVATION_TOOL = {
  name: 'save_reservation',
  description:
    '세움디자인하우징 방문 상담 예약을 CALL-OS에 저장한다. 고객의 성함과 희망 날짜/시간, ' +
    '방문할 전시장, 관심 평형이 확인되면 호출한다.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: '고객 성함' },
      phone: { type: 'string', description: '고객 전화번호(발신번호). 알 수 있으면 전달.' },
      showroom: { type: 'string', description: '방문 희망 전시장 (예: 안동전시장, 김포 본점)' },
      interested_size: { type: 'string', description: '관심 평형/모델 (예: 20평)' },
      date: { type: 'string', description: '희망 방문 날짜 (YYYY-MM-DD 또는 "이번 주 토요일" 등)' },
      time: { type: 'string', description: '희망 방문 시간 (예: 오후 2시)' },
      purpose: { type: 'string', description: '방문 목적/메모 (선택)' },
    },
    required: ['name'],
  },
}

function rpcResult(id, result) {
  return { jsonrpc: '2.0', id, result }
}
function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

async function handleRequest(msg) {
  const { id, method, params } = msg

  switch (method) {
    case 'initialize':
      return rpcResult(id, {
        protocolVersion: params?.protocolVersion || PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'call-os-reservations', version: '1.0.0' },
      })

    case 'tools/list':
      return rpcResult(id, { tools: [SAVE_RESERVATION_TOOL] })

    case 'tools/call': {
      const toolName = params?.name
      const args = params?.arguments || {}
      if (toolName !== 'save_reservation') {
        return rpcError(id, -32602, `알 수 없는 도구: ${toolName}`)
      }
      const saved = await insertReservation({ ...args, source: 'AI안내원(전화)' })
      const text = saved.ok
        ? `예약이 정상 접수되었습니다. (예약번호: ${saved.id || '생성됨'})`
        : `예약 저장 실패: ${saved.error}`
      return rpcResult(id, {
        content: [{ type: 'text', text }],
        isError: !saved.ok,
      })
    }

    case 'ping':
      return rpcResult(id, {})

    default:
      return rpcError(id, -32601, `지원하지 않는 메서드: ${method}`)
  }
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: JSON_HEADERS, body: '' }

  // 토큰 검증 (env 설정 시): ?token= 또는 Authorization: Bearer
  const secret = process.env.RESERVATION_WEBHOOK_SECRET
  if (secret) {
    const q = event.queryStringParameters || {}
    const auth = event.headers?.authorization || event.headers?.Authorization || ''
    const bearer = auth.replace(/^Bearer\s+/i, '')
    if (q.token !== secret && bearer !== secret) {
      return { statusCode: 401, headers: JSON_HEADERS, body: JSON.stringify(rpcError(null, -32001, '인증 실패')) }
    }
  }

  // GET: 서버 주도 SSE 스트림 미지원 (stateless) → 405
  if (event.httpMethod === 'GET') {
    return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify(rpcError(null, -32000, 'GET 스트림 미지원')) }
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify(rpcError(null, -32000, 'POST만 지원')) }
  }

  let payload
  try {
    payload = JSON.parse(event.body || '{}')
  } catch {
    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify(rpcError(null, -32700, 'JSON 파싱 오류')) }
  }

  const messages = Array.isArray(payload) ? payload : [payload]
  // 요청(id 있음)만 응답 대상, 알림(notification)은 응답 없음
  const requests = messages.filter(m => m && m.method && m.id !== undefined && m.id !== null)
  const hasOnlyNotifications = requests.length === 0

  if (hasOnlyNotifications) {
    // notifications/initialized 등 → 202 Accepted, 본문 없음
    return { statusCode: 202, headers: JSON_HEADERS, body: '' }
  }

  const responses = []
  for (const req of requests) {
    responses.push(await handleRequest(req))
  }

  const body = Array.isArray(payload) ? responses : responses[0]
  return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(body) }
}
