/**
 * CALL-OS 전화 라우팅 엔진
 *
 * 대표번호 인바운드 → ARS 메뉴 → 팀 선택 → 순차 연결 → 전체 동시 울림
 *
 * 이 모듈은 통신사/텔레포니 API(Twilio, 세종텔레콤, KT 등)와
 * 독립적으로 동작하는 라우팅 로직을 담당한다.
 * 실제 통신은 telephony adapter를 통해 처리된다.
 */

import { supabase, getCustomerByPhone, createCustomer, createCallLog } from './supabase'

// ──────────────────────────────────────────────
// 라우팅 설정
// ──────────────────────────────────────────────
const RING_TIMEOUT_SECONDS = 15   // 약 5회 벨 울림 ≒ 15초
const MAX_SEQUENTIAL_ATTEMPTS = 10 // 최대 순차 시도 수

// ──────────────────────────────────────────────
// 동적 ARS 멘트 생성
// 활성 팀 목록을 받아 메뉴 안내 멘트를 생성한다
// ──────────────────────────────────────────────
export function buildArsGreeting(teams, options = {}) {
  const { companyName = '안내', etcMenuNumber = null } = options
  const lines = [`안녕하세요, ${companyName}입니다.`, '원하시는 메뉴 번호를 눌러주세요.']
  teams.forEach((t, idx) => {
    lines.push(`${idx + 1}번 ${t.name},`)
  })
  if (etcMenuNumber) {
    lines.push(`${etcMenuNumber}번 기타문의`)
  }
  return lines.join('\n').trim()
}

/**
 * 활성 팀 목록 → ARS 메뉴 매핑 (입력번호 → 팀)
 * @param {Array} teams - is_active=true인 팀 배열
 * @returns {Object} { '1': team, '2': team, ... }
 */
export function buildArsMenu(teams) {
  const menu = {}
  teams.forEach((t, idx) => {
    menu[String(idx + 1)] = t
  })
  return menu
}

// ──────────────────────────────────────────────
// 텔레포니 어댑터 인터페이스 (추상)
// 실제 구현 시 Twilio/세종텔레콤/KT 등으로 교체
// ──────────────────────────────────────────────
const defaultTelephonyAdapter = {
  /**
   * 단일 번호로 전화 발신
   * @returns {Promise<{answered: boolean, duration: number}>}
   */
  async callSingle(fromNumber, toPhone, timeoutSec) {
    console.log(`[TEL] Calling ${toPhone} (timeout: ${timeoutSec}s)`)
    return { answered: false, duration: 0 }
  },

  /**
   * 여러 번호에 동시 발신, 가장 먼저 받는 번호로 연결
   * @returns {Promise<{answered: boolean, answeredPhone: string, duration: number}>}
   */
  async callBroadcast(fromNumber, toPhones, timeoutSec) {
    console.log(`[TEL] Broadcasting to ${toPhones.join(', ')} (timeout: ${timeoutSec}s)`)
    return { answered: false, answeredPhone: null, duration: 0 }
  },

  /**
   * ARS 멘트 재생 및 DTMF 입력 수집
   * @returns {Promise<string>} 선택한 메뉴 번호
   */
  async playIVRAndCollectInput(callSid, message) {
    console.log(`[TEL] Playing IVR: ${message}`)
    return '1'
  }
}

// ──────────────────────────────────────────────
// 메인 라우팅 로직
// ──────────────────────────────────────────────

/**
 * 인바운드 콜 처리 메인 함수
 * @param {string} customerPhone - 고객 전화번호
 * @param {string} callSid - 통화 식별자
 * @param {object} options - { telephony, companyName }
 * @returns {object} 라우팅 결과
 */
export async function handleInboundCall(customerPhone, callSid, options = {}) {
  const {
    telephony = defaultTelephonyAdapter,
    companyName = '안내',
  } = options

  const result = {
    customerPhone,
    teamCode: null,
    teamId: null,
    attempts: [],
    finalAgent: null,
    broadcastTriggered: false,
    status: 'ringing',
  }

  try {
    // 1. 활성 팀 조회 → 동적 ARS 멘트 생성
    const { data: activeTeams } = await supabase
      .from('teams')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true })

    if (!activeTeams || activeTeams.length === 0) {
      result.status = 'failed'
      await saveCallLog(result)
      return result
    }

    const greeting = buildArsGreeting(activeTeams, { companyName })
    const menu = buildArsMenu(activeTeams)

    // 2. ARS 멘트 재생 → 메뉴 선택
    const menuInput = await telephony.playIVRAndCollectInput(callSid, greeting)
    const selectedTeam = menu[menuInput]

    if (!selectedTeam) {
      result.teamCode = 'UNKNOWN'
      result.status = 'failed'
      await saveCallLog(result)
      return result
    }

    result.teamCode = selectedTeam.code
    result.teamId = selectedTeam.id

    // 3. 해당 팀 영업사원 조회 (우선순위순)
    const { data: agents } = await supabase
      .from('sales_agents')
      .select('*')
      .eq('team_id', selectedTeam.id)
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
        await upsertCustomer(customerPhone, selectedTeam.id, agent.name)
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
      await upsertCustomer(customerPhone, selectedTeam.id, answeredAgent?.name)
    } else {
      result.status = 'missed'
      // 부재중이라도 발신자 정보는 DB에 확보
      await upsertCustomer(customerPhone, selectedTeam.id, null)
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
      team_id: result.teamId,
      selected_menu: result.teamCode,
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
// 고객 자동 생성/업데이트 (대표번호로 들어온 발신자 정보 즉시 DB화)
// ──────────────────────────────────────────────
async function upsertCustomer(phone, teamId, managerName) {
  if (!phone) return
  try {
    const existing = await getCustomerByPhone(phone)
    if (existing) {
      const updates = { team_id: teamId }
      if (managerName) updates.manager = managerName
      await supabase.from('customers').update(updates).eq('id', existing.id)
    } else {
      await createCustomer({
        phone,
        status: '신규',
        team_id: teamId,
        manager: managerName,
        source: '인바운드콜',
      })
    }
  } catch (err) {
    console.error('[CALL-OS] Failed to upsert customer:', err)
  }
}

// ──────────────────────────────────────────────
// Mock 어댑터 (데모/테스트용)
// ──────────────────────────────────────────────
export function createMockTelephonyAdapter(scenario = 'second_agent_answers') {
  let callCount = 0

  return {
    async callSingle(_from, _to, _timeout) {
      callCount++
      await new Promise(r => setTimeout(r, 500))

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

    async callBroadcast(_from, toPhones, _timeout) {
      await new Promise(r => setTimeout(r, 800))
      if (scenario === 'broadcast_answers') {
        return { answered: true, answeredPhone: toPhones[1], duration: 60 }
      }
      return { answered: false, answeredPhone: null, duration: 0 }
    },

    async playIVRAndCollectInput(_callSid, _message) {
      return '1'
    }
  }
}
