/**
 * Anthropic Claude API 래퍼 (서버리스 함수용)
 *
 * AI 안내원의 대화 응답을 생성한다. 음성 통화 특성상 낮은 지연이 중요하므로
 * 기본 모델은 빠른 Haiku 계열을 사용하며, ANTHROPIC_MODEL 로 교체 가능하다.
 *
 * 응답은 아래 JSON 스키마를 따르도록 지시한다:
 *   {
 *     "say":     "고객에게 음성으로 읽어줄 안내 문구",
 *     "action":  "continue | book | transfer | goodbye",
 *     "intent":  "예약 | 문의 | 상담연결 | 기타",
 *     "booking": { "name": "", "date": "", "time": "", "purpose": "" }  // action=book 일 때만
 *   }
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001'

/**
 * Claude 메시지 API 호출 → 순수 텍스트 반환
 */
export async function callClaude({ system, messages, maxTokens = 500 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.')

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages,
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Claude API 오류 ${res.status}: ${detail}`)
  }

  const data = await res.json()
  return (data.content || []).map(b => b.text || '').join('').trim()
}

/**
 * 응답 텍스트에서 JSON 액션 객체를 추출한다.
 * 모델이 코드펜스/서술을 섞어도 최대한 복원하고, 실패 시 전체를 안내 문구로 처리한다.
 */
export function parseAction(text) {
  const fallback = { say: text, action: 'continue', intent: '기타', booking: null }
  if (!text) return { ...fallback, say: '죄송합니다, 다시 한 번 말씀해 주시겠어요?' }

  // 첫 '{' ~ 마지막 '}' 구간을 JSON 후보로 추출
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return fallback

  try {
    const parsed = JSON.parse(text.slice(start, end + 1))
    const action = ['continue', 'book', 'transfer', 'goodbye'].includes(parsed.action)
      ? parsed.action
      : 'continue'
    return {
      say: (parsed.say || '').trim() || fallback.say,
      action,
      intent: parsed.intent || '기타',
      booking: parsed.booking || null,
    }
  } catch {
    return fallback
  }
}

/**
 * AI 안내원 한 턴 실행: 대화 이력 → {say, action, intent, booking}
 */
export async function runReceptionistTurn({ system, messages, maxTokens = 500 }) {
  const text = await callClaude({ system, messages, maxTokens })
  return parseAction(text)
}
