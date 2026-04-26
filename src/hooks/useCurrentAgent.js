import { useEffect, useState, useCallback } from 'react'

const STORAGE_KEY = 'call-os.current-agent-id'

/**
 * 현재 영업사원 식별 훅 (localStorage 기반)
 *
 * 인증 도입 전 임시: 영업사원이 본인 이름을 한 번 선택하면 이 기기에 저장.
 * 인증 도입 시 Supabase auth 의 user.id ↔ sales_agents.id 매핑으로 교체.
 */
export function useCurrentAgent() {
  const [agentId, setAgentIdState] = useState(() => {
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem(STORAGE_KEY) || null
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (agentId) {
      window.localStorage.setItem(STORAGE_KEY, agentId)
    } else {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  }, [agentId])

  const setAgentId = useCallback((id) => setAgentIdState(id || null), [])
  const clear = useCallback(() => setAgentIdState(null), [])

  return { agentId, setAgentId, clear }
}
