/**
 * 담당 전시장 매칭 + 팀장 문자 알림 공용 모듈
 * clawops-webhook, mcp 함수가 공용으로 사용.
 */

import { sbSelect } from './supabase-rest.js'
import { sendSms, solapiConfigured } from './solapi.js'

// 예약한 전시장명을 teams와 매칭 (이름 포함 / 지역 키워드)
export async function resolveTeam(showroom) {
  try {
    const teams = await sbSelect('teams', 'select=*')
    if (!teams?.length) return null
    const s = String(showroom || '')
    let hit = teams.find(t => s && (s.includes(t.name) || t.name.includes(s)))
    if (hit) return hit
    const KEYS = [
      ['안동', '안동'], ['강화', '강화'], ['광주', '광주'],
      ['월곶', '제3'], ['통진', '제1'], ['본점', '본점'], ['김포', '본점'],
    ]
    for (const [kw, hint] of KEYS) {
      if (s.includes(kw)) {
        hit = teams.find(t => t.name.includes(hint))
        if (hit) return hit
      }
    }
    return null
  } catch {
    return null
  }
}

// 전시장 팀장에게 예약 알림 문자
export async function notifyManager(team, booking) {
  if (!solapiConfigured()) return { ok: false, error: 'SOLAPI 미설정' }
  const managerPhone = team?.manager_phone
  if (!managerPhone) return { ok: false, error: '팀장 번호 없음' }

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
  if (!r.ok) console.error('[notify] 문자 발송 실패:', r.error)
  return r
}
