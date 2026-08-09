/**
 * 솔라피(Solapi) 문자 발송 모듈 (서버리스 함수용)
 *
 * v4 단건 발송 API + HMAC-SHA256 인증.
 * SMS(90바이트 이하)/LMS(장문)는 텍스트 길이에 따라 솔라피가 자동 선택한다.
 *
 * 필요 env: SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER(사전 등록된 발신번호)
 */

import crypto from 'node:crypto'

const SEND_URL = 'https://api.solapi.com/messages/v4/send'

export function solapiConfigured() {
  return !!(process.env.SOLAPI_API_KEY && process.env.SOLAPI_API_SECRET && process.env.SOLAPI_SENDER)
}

const onlyDigits = (s) => String(s || '').replace(/[^0-9]/g, '')

function authHeader() {
  const apiKey = process.env.SOLAPI_API_KEY
  const apiSecret = process.env.SOLAPI_API_SECRET
  const date = new Date().toISOString()
  const salt = crypto.randomBytes(32).toString('hex')
  const signature = crypto.createHmac('sha256', apiSecret).update(date + salt).digest('hex')
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`
}

/**
 * 단건 문자 발송. 반환: { ok:true, data } | { ok:false, error }
 */
export async function sendSms({ to, text, from }) {
  if (!solapiConfigured()) return { ok: false, error: 'SOLAPI 미설정' }
  const sender = onlyDigits(from || process.env.SOLAPI_SENDER)
  const dest = onlyDigits(to)
  if (!dest) return { ok: false, error: '수신번호 없음' }

  try {
    const res = await fetch(SEND_URL, {
      method: 'POST',
      headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { to: dest, from: sender, text } }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: `Solapi ${res.status}: ${JSON.stringify(data)}` }
    // 실패 상태 코드가 본문에 담기는 경우 처리
    if (data.statusCode && data.statusCode !== '2000') {
      return { ok: false, error: `Solapi ${data.statusCode}: ${data.statusMessage || ''}` }
    }
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}
