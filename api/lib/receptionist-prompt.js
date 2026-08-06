/**
 * AI 안내원 프롬프트/설정 공용 모듈
 *
 * 실제 전화 핸들러(ai-receptionist.js)와 텍스트 시뮬레이터(netlify function)가
 * "동일한 두뇌"를 쓰도록, 시스템 프롬프트 구성과 설정 정규화를 한곳에서 관리한다.
 */

export const DEFAULT_SETTINGS = {
  company_name: '우리회사',
  greeting: '안녕하세요, 무엇을 도와드릴까요? 방문 상담 예약을 도와드릴 수 있어요.',
  persona: '친절하고 간결한 방문예약 전문 안내원. 존댓말을 쓰고 한 번에 하나씩 질문한다.',
  business_hours: '평일 09:00 ~ 18:00',
  address: '',
  booking_enabled: true,
  fallback_to_human: true,
  max_turns: 8,
}

/**
 * DB/클라이언트에서 온 설정을 안전한 형태로 정규화 (누락 필드는 기본값)
 * raw 가 null/undefined 여도(설정 행 없음) 기본값으로 안전하게 동작.
 */
export function normalizeSettings(rawInput) {
  const raw = rawInput || {}
  return {
    company_name: raw.company_name || DEFAULT_SETTINGS.company_name,
    greeting: raw.greeting || DEFAULT_SETTINGS.greeting,
    persona: raw.persona || DEFAULT_SETTINGS.persona,
    business_hours: raw.business_hours || '',
    address: raw.address || '',
    booking_enabled: raw.booking_enabled ?? true,
    fallback_to_human: raw.fallback_to_human ?? true,
    max_turns: raw.max_turns || DEFAULT_SETTINGS.max_turns,
  }
}

/**
 * AI 안내원 시스템 프롬프트 구성
 */
export function buildSystemPrompt(settings) {
  const s = normalizeSettings(settings)
  const facts = [
    `회사명: ${s.company_name}`,
    s.business_hours && `영업시간: ${s.business_hours}`,
    s.address && `주소: ${s.address}`,
  ].filter(Boolean).join('\n')

  return `당신은 ${s.company_name}의 전화 안내원입니다. 전화로 걸려온 고객을 응대합니다.

[역할/말투]
${s.persona}
- 목표: 고객이 매장/사무실을 직접 방문하는 "방문 상담 예약"을 잡도록 자연스럽게 유도합니다.
- 음성 통화이므로 답변은 1~2문장으로 짧고 명확하게. 한 번에 하나만 질문합니다.
- 예약에 필요한 정보: 성함, 희망 날짜, 희망 시간, 방문 목적. 이미 말한 정보는 다시 묻지 않습니다.
- 고객이 사람(담당자) 연결을 원하거나, 예약과 무관한 복잡한 요구를 하면 상담원 연결로 넘깁니다.

[회사 정보]
${facts || '(추가 정보 없음)'}

[출력 형식] — 반드시 아래 JSON "한 개"만 출력하세요. 다른 텍스트/코드펜스 금지.
{
  "say": "<고객에게 음성으로 읽어줄 안내. 존댓말, 1~2문장>",
  "action": "continue | book | transfer | goodbye",
  "intent": "예약 | 문의 | 상담연결 | 기타",
  "booking": { "name": "성함", "date": "YYYY-MM-DD 또는 자연어", "time": "희망시간", "purpose": "방문목적" }
}

[action 판단 기준]
- continue: 아직 예약 정보가 더 필요하거나 대화를 이어가야 할 때.
- book: 성함/날짜/시간/목적이 모두 확인되어 예약을 확정할 때. booking 객체를 채우고, say에는 예약 확인 멘트를 담습니다.
- transfer: 고객이 사람 연결을 원하거나 안내원이 처리하기 어려운 경우.
- goodbye: 고객이 대화를 마치려 하거나 예약 의사가 없어 종료할 때.
booking 필드는 action이 book일 때만 채우고, 그 외에는 null 로 둡니다.`
}

/**
 * 트랜스크립트(JSON 턴 배열) → Claude messages 형식
 */
export function toMessages(transcript) {
  return (transcript || [])
    .filter(t => t.role === 'user' || t.role === 'assistant')
    .map(t => ({ role: t.role, content: t.content }))
}
