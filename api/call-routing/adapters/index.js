/**
 * 통신사 어댑터 셀렉터
 *
 * 환경변수 TELEPHONY_PROVIDER 값에 따라 어댑터를 선택한다.
 * - twilio (기본값): 개발/시연용
 * - sejong: 세종텔레콤 (추후 구현)
 * - kt: KT 비즈콜 (추후 구현)
 *
 * 새 통신사 추가 시 이 파일에 import 후 분기만 추가하면 됨.
 */

import { twilioAdapter } from './twilio.js'

export function getAdapter() {
  const provider = (process.env.TELEPHONY_PROVIDER || 'twilio').toLowerCase()
  switch (provider) {
    case 'twilio':
      return twilioAdapter
    // case 'sejong':
    //   return sejongAdapter
    // case 'kt':
    //   return ktAdapter
    default:
      console.warn(`[CALL-OS] Unknown TELEPHONY_PROVIDER: ${provider}, falling back to twilio`)
      return twilioAdapter
  }
}
