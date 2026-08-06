/**
 * AI 안내원 텍스트 시뮬레이터 엔드포인트 (Netlify Function)
 *
 * 프론트(관리 화면)에서 채팅으로 AI 안내원을 테스트할 때 호출한다.
 * 실제 전화 핸들러(ai-receptionist.js)와 "동일한 시스템 프롬프트/모델"을 사용하므로,
 * 여기서 튜닝한 인사말/말투/대화 흐름이 실제 통화에도 그대로 반영된다.
 *
 * 요청  (POST /.netlify/functions/ai-sim):
 *   { settings: {...ai_settings}, messages: [{role, content}, ...] }
 * 응답:
 *   { say, action, intent, booking }
 *
 * 필요 환경변수: ANTHROPIC_API_KEY (Netlify 환경변수에 설정)
 */

import { runReceptionistTurn } from '../../api/lib/claude.js'
import { buildSystemPrompt } from '../../api/lib/receptionist-prompt.js'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' }
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'POST만 지원합니다.' }) }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        say: '(설정 필요) Anthropic API 키가 서버에 등록되지 않았습니다. Netlify 환경변수 ANTHROPIC_API_KEY를 설정해 주세요.',
        action: 'continue',
        intent: '기타',
        booking: null,
        needsApiKey: true,
      }),
    }
  }

  let payload
  try {
    payload = JSON.parse(event.body || '{}')
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: '잘못된 요청 형식' }) }
  }

  const { settings = {}, messages = [] } = payload

  try {
    const result = await runReceptionistTurn({
      system: buildSystemPrompt(settings),
      messages: messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content })),
    })
    return { statusCode: 200, headers: CORS, body: JSON.stringify(result) }
  } catch (err) {
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        say: `(오류) AI 응답 생성에 실패했습니다: ${err.message}`,
        action: 'continue',
        intent: '기타',
        booking: null,
        error: true,
      }),
    }
  }
}
