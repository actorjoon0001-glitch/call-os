/**
 * Twilio 어댑터
 *
 * Twilio Voice Webhook 페이로드를 파싱하고 TwiML 응답을 생성한다.
 * 다른 통신사 어댑터(세종텔레콤, KT 등)도 동일한 인터페이스를 따른다.
 */

const TTS_VOICE = 'Polly.Seoyeon' // Twilio 한국어 보이스
const TTS_LANG = 'ko-KR'

function escapeXml(str) {
  if (str == null) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function xmlResponse(body) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/xml' },
    body: `<?xml version="1.0" encoding="UTF-8"?>\n${body}`,
  }
}

export const twilioAdapter = {
  /**
   * 인바운드 웹훅 페이로드 파싱
   */
  parseInbound(req) {
    return {
      callerPhone: req.body?.From,
      callSid: req.body?.CallSid,
    }
  },

  parseMenuSelect(req) {
    return {
      digits: req.body?.Digits,
      callerPhone: req.body?.From,
      callSid: req.body?.CallSid,
    }
  },

  parseDialStatus(req) {
    return {
      status: req.body?.DialCallStatus,
      callerPhone: req.body?.From,
    }
  },

  /**
   * 음성 인식(STT) 결과 파싱 — AI 안내원 대화용
   */
  parseSpeechResult(req) {
    return {
      transcript: req.body?.SpeechResult || '',
      confidence: parseFloat(req.body?.Confidence || '0'),
      callerPhone: req.body?.From,
      callSid: req.body?.CallSid,
    }
  },

  /**
   * ARS 멘트 + DTMF 입력 수집 응답
   */
  buildIVRResponse({ greeting, actionUrl, retryUrl, timeoutSec = 10 }) {
    return xmlResponse(`<Response>
  <Gather input="dtmf" numDigits="1" action="${escapeXml(actionUrl)}" timeout="${timeoutSec}">
    <Say language="${TTS_LANG}" voice="${TTS_VOICE}">${escapeXml(greeting)}</Say>
  </Gather>
  <Say language="${TTS_LANG}" voice="${TTS_VOICE}">입력이 없습니다. 다시 시도해 주세요.</Say>
  <Redirect>${escapeXml(retryUrl)}</Redirect>
</Response>`)
  },

  /**
   * 단순 안내 후 종료
   */
  buildSayAndHangup(message) {
    return xmlResponse(`<Response>
  <Say language="${TTS_LANG}" voice="${TTS_VOICE}">${escapeXml(message)}</Say>
  <Hangup/>
</Response>`)
  },

  /**
   * 잘못된 입력 → 다시 시도
   */
  buildRetry(message, retryUrl) {
    return xmlResponse(`<Response>
  <Say language="${TTS_LANG}" voice="${TTS_VOICE}">${escapeXml(message)}</Say>
  <Redirect>${escapeXml(retryUrl)}</Redirect>
</Response>`)
  },

  /**
   * 단일 번호 다이얼
   */
  buildDialSingle({ message, phone, callerId, timeoutSec, statusCallbackUrl }) {
    return xmlResponse(`<Response>
  ${message ? `<Say language="${TTS_LANG}" voice="${TTS_VOICE}">${escapeXml(message)}</Say>` : ''}
  <Dial timeout="${timeoutSec}"
        action="${escapeXml(statusCallbackUrl)}"
        callerId="${escapeXml(callerId)}">
    <Number>${escapeXml(phone)}</Number>
  </Dial>
</Response>`)
  },

  /**
   * 여러 번호 동시 다이얼 (먼저 받는 사람과 연결)
   */
  buildDialBroadcast({ phones, callerId, timeoutSec, statusCallbackUrl }) {
    const numbers = phones.map(p => `<Number>${escapeXml(p)}</Number>`).join('\n    ')
    return xmlResponse(`<Response>
  <Dial timeout="${timeoutSec}"
        action="${escapeXml(statusCallbackUrl)}"
        callerId="${escapeXml(callerId)}">
    ${numbers}
  </Dial>
</Response>`)
  },

  buildHangup() {
    return xmlResponse(`<Response>\n  <Hangup/>\n</Response>`)
  },

  /**
   * AI 안내원: 안내 문구 재생 + 음성 응답 수집
   * 무응답 시 재안내 URL로 리다이렉트.
   */
  buildSayAndGatherSpeech({ message, actionUrl, repromptUrl, timeoutSec = 5 }) {
    return xmlResponse(`<Response>
  <Gather input="speech" language="${TTS_LANG}" speechTimeout="auto" timeout="${timeoutSec}" action="${escapeXml(actionUrl)}">
    <Say language="${TTS_LANG}" voice="${TTS_VOICE}">${escapeXml(message)}</Say>
  </Gather>
  <Say language="${TTS_LANG}" voice="${TTS_VOICE}">말씀이 없으시네요. 다시 안내해 드릴게요.</Say>
  <Redirect>${escapeXml(repromptUrl)}</Redirect>
</Response>`)
  },

  /**
   * 안내 문구 재생 후 지정 URL로 리다이렉트 (사람 연결 등 핸드오프)
   */
  buildSayAndRedirect({ message, redirectUrl }) {
    return xmlResponse(`<Response>
  ${message ? `<Say language="${TTS_LANG}" voice="${TTS_VOICE}">${escapeXml(message)}</Say>` : ''}
  <Redirect>${escapeXml(redirectUrl)}</Redirect>
</Response>`)
  },
}
