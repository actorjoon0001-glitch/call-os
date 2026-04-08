/**
 * CALL-OS 인바운드 콜 웹훅 핸들러
 *
 * 이 파일은 서버리스 함수(Supabase Edge Function, Vercel Serverless, AWS Lambda 등)로
 * 배포하여 텔레포니 API(Twilio, Vonage 등)의 웹훅을 받는 엔드포인트입니다.
 *
 * ───────────────────────────────────────
 * 흐름도:
 *
 * [고객 전화] → [대표번호 수신]
 *     → POST /api/call-routing/inbound (이 핸들러)
 *     → ARS 안내 멘트 재생 + DTMF 입력 대기
 *     → POST /api/call-routing/menu-select (메뉴 선택 처리)
 *     → 순차 연결 시작
 *     → POST /api/call-routing/status-callback (각 연결 결과)
 *     → 실패 시 전체 동시 울림
 *     → 통화 로그 저장
 * ───────────────────────────────────────
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const ARS_MENU = {
  '1': 'GIMPO',
  '2': 'GANGHWA',
  '3': 'SEOUL',
  '4': 'ETC',
}

const RING_TIMEOUT = 15 // 약 5회 벨 (초)

/**
 * 1단계: 인바운드 콜 수신 → ARS 멘트 재생
 * Twilio 예시 응답 (TwiML)
 */
export async function handleInbound(req) {
  const { From: callerPhone, CallSid: callSid } = req.body || {}

  // Twilio TwiML 응답 예시
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf" numDigits="1" action="/api/call-routing/menu-select" timeout="10">
    <Say language="ko-KR" voice="Polly.Seoyeon">
      안녕하세요, 세움건설입니다.
      원하시는 전시장 번호를 눌러주세요.
      1번 김포전시장,
      2번 강화전시장,
      3번 서울전시장,
      4번 기타문의
    </Say>
  </Gather>
  <Say language="ko-KR" voice="Polly.Seoyeon">
    입력이 없습니다. 다시 시도해 주세요.
  </Say>
  <Redirect>/api/call-routing/inbound</Redirect>
</Response>`

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/xml' },
    body: twiml,
  }
}

/**
 * 2단계: 메뉴 선택 → 순차 연결 시작
 */
export async function handleMenuSelect(req) {
  const { Digits: digits, From: callerPhone, CallSid: callSid } = req.body || {}
  const showroomCode = ARS_MENU[digits]

  if (!showroomCode) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/xml' },
      body: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="ko-KR" voice="Polly.Seoyeon">잘못된 입력입니다.</Say>
  <Redirect>/api/call-routing/inbound</Redirect>
</Response>`,
    }
  }

  if (showroomCode === 'ETC') {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/xml' },
      body: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="ko-KR" voice="Polly.Seoyeon">
    기타 문의는 대표 이메일로 연락 부탁드립니다. 감사합니다.
  </Say>
  <Hangup/>
</Response>`,
    }
  }

  // 전시장 조회
  const { data: showroom } = await supabase
    .from('showrooms')
    .select('id')
    .eq('code', showroomCode)
    .eq('is_active', true)
    .single()

  if (!showroom) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/xml' },
      body: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="ko-KR" voice="Polly.Seoyeon">현재 해당 전시장은 운영되지 않습니다.</Say>
  <Hangup/>
</Response>`,
    }
  }

  // 영업팀원 조회 (순서대로)
  const { data: agents } = await supabase
    .from('sales_agents')
    .select('*')
    .eq('showroom_id', showroom.id)
    .eq('is_active', true)
    .order('priority', { ascending: true })

  if (!agents || agents.length === 0) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/xml' },
      body: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="ko-KR" voice="Polly.Seoyeon">현재 상담 가능한 직원이 없습니다.</Say>
  <Hangup/>
</Response>`,
    }
  }

  // 첫 번째 담당자에게 순차 연결 시작
  const firstAgent = agents[0]
  const remainingAgentIds = agents.slice(1).map(a => a.id).join(',')

  // 통화 로그 미리 생성
  const { data: callLog } = await supabase
    .from('call_logs')
    .insert({
      customer_phone: callerPhone,
      showroom_id: showroom.id,
      selected_menu: showroomCode,
      call_status: 'ringing',
      ring_attempt_count: 1,
    })
    .select()
    .single()

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/xml' },
    body: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="ko-KR" voice="Polly.Seoyeon">
    ${showroomCode} 전시장으로 연결합니다. 잠시만 기다려 주세요.
  </Say>
  <Dial timeout="${RING_TIMEOUT}"
        action="/api/call-routing/status-callback?callLogId=${callLog?.id}&showroomId=${showroom.id}&remainingAgents=${remainingAgentIds}&attemptCount=1&agentId=${firstAgent.id}"
        callerId="${callerPhone}">
    <Number>${firstAgent.phone}</Number>
  </Dial>
</Response>`,
  }
}

/**
 * 3단계: 연결 결과 콜백 → 다음 담당자 or 전체 동시 울림
 */
export async function handleStatusCallback(req) {
  const { DialCallStatus: status } = req.body || {}
  const {
    callLogId,
    showroomId,
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

    // 고객 자동 생성/매칭
    await upsertCustomerFromCall(req.body?.From, showroomId, agentId)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/xml' },
      body: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`,
    }
  }

  // 미응답 → 다음 담당자 or 전체 동시 울림
  const remaining = remainingAgents ? remainingAgents.split(',').filter(Boolean) : []

  if (remaining.length > 0) {
    // 다음 담당자에게 순차 연결
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

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/xml' },
      body: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="${RING_TIMEOUT}"
        action="/api/call-routing/status-callback?callLogId=${callLogId}&showroomId=${showroomId}&remainingAgents=${nextRemaining}&attemptCount=${count + 1}&agentId=${nextAgentId}"
        callerId="${req.body?.From}">
    <Number>${nextAgent?.phone}</Number>
  </Dial>
</Response>`,
    }
  }

  // 전체 동시 울림
  const { data: allAgents } = await supabase
    .from('sales_agents')
    .select('*')
    .eq('showroom_id', showroomId)
    .eq('is_active', true)

  await supabase
    .from('call_logs')
    .update({
      ring_attempt_count: count + 1,
      broadcast_triggered: true,
    })
    .eq('id', callLogId)

  const numberElements = (allAgents || [])
    .map(a => `<Number>${a.phone}</Number>`)
    .join('\n    ')

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/xml' },
    body: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="${RING_TIMEOUT * 2}"
        action="/api/call-routing/broadcast-callback?callLogId=${callLogId}&showroomId=${showroomId}"
        callerId="${req.body?.From}">
    ${numberElements}
  </Dial>
</Response>`,
  }
}

/**
 * 4단계: 동시 울림 결과 콜백
 */
export async function handleBroadcastCallback(req) {
  const { DialCallStatus: status, DialCallSid: dialSid } = req.body || {}
  const { callLogId, showroomId } = req.query || {}

  if (status === 'completed' || status === 'answered') {
    await supabase
      .from('call_logs')
      .update({ call_status: 'answered' })
      .eq('id', callLogId)

    await upsertCustomerFromCall(req.body?.From, showroomId, null)
  } else {
    await supabase
      .from('call_logs')
      .update({ call_status: 'missed' })
      .eq('id', callLogId)
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/xml' },
    body: `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`,
  }
}

/**
 * 고객 자동 생성/매칭 헬퍼
 */
async function upsertCustomerFromCall(phone, showroomId, agentId) {
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
    await supabase
      .from('customers')
      .update({
        manager: agentName,
        showroom_id: showroomId,
      })
      .eq('id', existing.id)
  } else {
    await supabase.from('customers').insert({
      phone,
      status: '신규',
      showroom_id: showroomId,
      manager: agentName,
      source: '인바운드콜',
    })
  }
}
