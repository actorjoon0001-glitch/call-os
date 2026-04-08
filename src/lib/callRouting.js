/**
 * CALL-OS 전화 라우팅 엔진
 *
 * 대표번호 인바운드 → 전시장 선택 → 순차 연결 → 전체 동시 울림
 *
 * 이 모듈은 텔레포니 API(Twilio, Vonage, 세종텔레콤 등)와
 * 독립적으로 동작하는 라우팅 로직을 담당한다.
 * 실제 전화 발신/수신은 telephonyAdapter를 통해 처리된다.
 */

import { supabase, getCustomerByPhone, createCustomer, createCallLog } from './supabase'

// ──────────────────────────────────────────────
// ARS 메뉴 매핑
// ──────────────────────────────────────────────
export const ARS_MENU = {
  '1': 'GIMPO',    // 김포전시장
  '2': 'GANGHWA',  // 강화전시장
  '3': 'SEOUL',    // 서울전시장
  '4': 'ETC',      // 기타문의
}

export const ARS_GREETING = `
안녕하세요, 세움건설입니다.
원하시는 전시장 번호를 눌러주세요.
1번 김포전시장,
2번 강화전시장,
3번 서울전시장,
4번 기타문의
`.trim()

// ──────────────────────────────────────────────
// 라우팅 설정
// ──────────────────────────────────────────────
const RING_TIMEOUT_SECONDS = 15   // 약 5회 벨 울림 ≒ 15초
const MAX_SEQUENTIAL_ATTEMPTS = 10 // 최대 순차 시도 수

// ──────────────────────────────────────────────
// 텔레포니 어댑터 인터페이스 (추상)
// 실제 구현 시 Twilio/Vonage 등 SDK로 교체
// ──────────────────────────────────────────────
const defaultTelephonyAdapter = {
  /**
   * 단일 번호로 전화 발신
   * @returns {Promise<{answered: boolean, duration: number}>}
   */
  async callSingle(fromNumber, toPhone, timeoutSec) {
    console.log(`[TEL] Calling ${toPhone} (timeout: ${timeoutSec}s)`)
    // 실제 구현: Twilio client.calls.create({...})
    return { answered: false, duration: 0 }
  },

  /**
   * 여러 번호에 동시 발신, 가장 먼저 받는 번호로 연결
   * @returns {Promise<{answered: boolean, answeredPhone: string, duration: number}>}
   */
  async callBroadcast(fromNumber, toPhones, timeoutSec) {
    console.log(`[TEL] Broadcasting to ${toPhones.join(', ')} (timeout: ${timeoutSec}s)`)
    // 실제 구현: Promise.race 또는 Twilio Conference
    return { answered: false, answeredPhone: null, duration: 0 }
  },

  /**
   * ARS 멘트 재생 및 DTMF 입력 수집
   * @returns {Promise<string>} 선택한 메뉴 번호
   */
  async playIVRAndCollectInput(callSid, message) {
    console.log(`[TEL] Playing IVR: ${message}`)
    return '1' // 시뮬레이션: 1번 선택
  }
}

// ──────────────────────────────────────────────
// 메인 라우팅 로직
// ──────────────────────────────────────────────

/**
 * 인바운드 콜 처리 메인 함수
 * @param {string} customerPhone - 고객 전화번호
 * @param {object} telephony - 텔레포니 어댑터 (선택)
 * @returns {object} 라우팅 결과
 */
export async function handleInboundCall(customerPhone, callSid, telephony = defaultTelephonyAdapter) {
  const result = {
    customerPhone,
    showroomCode: null,
    showroomId: null,
    attempts: [],
    finalAgent: null,
    broadcastTriggered: false,
    status: 'ringing',
  }

  try {
    // 1. ARS 메뉴 재생 → 전시장 선택
    const menuInput = await telephony.playIVRAndCollectInput(callSid, ARS_GREETING)
    const showroomCode = ARS_MENU[menuInput]

    if (!showroomCode || showroomCode === 'ETC') {
      result.showroomCode = showroomCode || 'UNKNOWN'
      result.status = showroomCode === 'ETC' ? 'answered' : 'failed'
      await saveCallLog(result)
      return result
    }

    result.showroomCode = showroomCode

    // 2. 해당 전시장 정보 조회
    const { data: showroom } = await supabase
      .from('showrooms')
      .select('id')
      .eq('code', showroomCode)
      .eq('is_active', true)
      .single()

    if (!showroom) {
      result.status = 'failed'
      await saveCallLog(result)
      return result
    }

    result.showroomId = showroom.id

    // 3. 해당 전시장 영업팀원 조회 (우선순위순)
    const { data: agents } = await supabase
      .from('sales_agents')
      .select('*')
      .eq('showroom_id', showroom.id)
      .eq('is_active', true)
      .order('priority', { ascending: true })

    if (!agents || agents.length === 0) {
      result.status = 'failed'
      await saveCallLog(result)
      return result
    }

    // 4. 순차 연결 시도
    for (let i = 0; i < Math.min(agents.length, MAX_SEQUENTIAL_ATTEMPTS); i++) {
      const agent = agents[i]
      const attempt = {
        agentId: agent.id,
        agentName: agent.name,
        agentPhone: agent.phone,
        priority: agent.priority,
        answered: false,
      }

      const callResult = await telephony.callSingle(
        customerPhone,
        agent.phone,
        RING_TIMEOUT_SECONDS
      )

      attempt.answered = callResult.answered
      result.attempts.push(attempt)

      if (callResult.answered) {
        result.finalAgent = agent
        result.status = 'answered'
        await saveCallLog(result)
        await upsertCustomer(customerPhone, showroom.id, agent.name)
        return result
      }
    }

    // 5. 순차 연결 실패 → 전체 동시 울림
    result.broadcastTriggered = true
    const allPhones = agents.map(a => a.phone)

    const broadcastResult = await telephony.callBroadcast(
      customerPhone,
      allPhones,
      RING_TIMEOUT_SECONDS * 2
    )

    if (broadcastResult.answered) {
      const answeredAgent = agents.find(a => a.phone === broadcastResult.answeredPhone)
      result.finalAgent = answeredAgent || null
      result.status = 'answered'
      await upsertCustomer(customerPhone, showroom.id, answeredAgent?.name)
    } else {
      result.status = 'missed'
    }

    await saveCallLog(result)
    return result

  } catch (error) {
    console.error('[CALL-OS] Routing error:', error)
    result.status = 'failed'
    await saveCallLog(result)
    return result
  }
}

// ──────────────────────────────────────────────
// 통화 로그 저장
// ──────────────────────────────────────────────
async function saveCallLog(result) {
  try {
    await createCallLog({
      customer_phone: result.customerPhone,
      showroom_id: result.showroomId,
      selected_menu: result.showroomCode,
      call_status: result.status,
      answered_by_agent_id: result.finalAgent?.id || null,
      ring_attempt_count: result.attempts.length,
      broadcast_triggered: result.broadcastTriggered,
    })
  } catch (err) {
    console.error('[CALL-OS] Failed to save call log:', err)
  }
}

// ──────────────────────────────────────────────
// 고객 자동 생성/업데이트
// ──────────────────────────────────────────────
async function upsertCustomer(phone, showroomId, managerName) {
  try {
    const existing = await getCustomerByPhone(phone)
    if (existing) {
      // 기존 고객: 담당자/전시장 업데이트
      await supabase
        .from('customers')
        .update({
          manager: managerName,
          showroom_id: showroomId,
        })
        .eq('id', existing.id)
    } else {
      // 신규 고객 자동 생성
      await createCustomer({
        phone,
        status: '신규',
        showroom_id: showroomId,
        manager: managerName,
        source: '인바운드콜',
      })
    }
  } catch (err) {
    console.error('[CALL-OS] Failed to upsert customer:', err)
  }
}

// ──────────────────────────────────────────────
// 시뮬레이션 (데모/테스트용)
// ──────────────────────────────────────────────
export function createMockTelephonyAdapter(scenario = 'second_agent_answers') {
  let callCount = 0

  return {
    async callSingle(from, to, timeout) {
      callCount++
      await new Promise(r => setTimeout(r, 500)) // 시뮬레이션 딜레이

      if (scenario === 'first_agent_answers' && callCount === 1) {
        return { answered: true, duration: 120 }
      }
      if (scenario === 'second_agent_answers' && callCount === 2) {
        return { answered: true, duration: 90 }
      }
      if (scenario === 'all_fail') {
        return { answered: false, duration: 0 }
      }
      return { answered: false, duration: 0 }
    },

    async callBroadcast(from, toPhones, timeout) {
      await new Promise(r => setTimeout(r, 800))
      if (scenario === 'broadcast_answers') {
        return { answered: true, answeredPhone: toPhones[1], duration: 60 }
      }
      return { answered: false, answeredPhone: null, duration: 0 }
    },

    async playIVRAndCollectInput(callSid, message) {
      return '1' // 기본: 김포전시장 선택
    }
  }
}
