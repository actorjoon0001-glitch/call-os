import { useEffect, useMemo, useState } from 'react'
import {
  Phone,
  PhoneIncoming,
  PhoneOff,
  Search,
  UserPlus,
  RefreshCw,
  ChevronRight,
} from 'lucide-react'
import Badge from '../components/ui/Badge'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import QuickCustomerModal from '../components/QuickCustomerModal'
import { useCurrentAgent } from '../hooks/useCurrentAgent'
import { getAgents, getCallLogs, getCustomers } from '../lib/supabase'

function isToday(iso) {
  const d = new Date(iso)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

export default function MyDay() {
  const { agentId, setAgentId } = useCurrentAgent()
  const [agents, setAgents] = useState([])
  const [callLogs, setCallLogs] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [modalState, setModalState] = useState({ phone: '', customer: null })

  const me = useMemo(
    () => agents.find((a) => a.id === agentId) || null,
    [agents, agentId]
  )

  const load = async () => {
    setRefreshing(true)
    try {
      const [ag, calls, custs] = await Promise.all([
        getAgents(),
        getCallLogs(),
        getCustomers(),
      ])
      setAgents(ag || [])
      setCallLogs(calls || [])
      setCustomers(custs || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const todayCalls = useMemo(
    () => callLogs.filter((c) => isToday(c.created_at)),
    [callLogs]
  )

  const myMissedCalls = useMemo(() => {
    if (!me) return []
    return todayCalls.filter(
      (c) =>
        c.call_status === 'missed' &&
        (!c.team_id || c.team_id === me.team_id)
    )
  }, [todayCalls, me])

  const myAnsweredCalls = useMemo(() => {
    if (!me) return []
    return todayCalls.filter(
      (c) => c.call_status === 'answered' && c.answered_by_agent_id === me.id
    )
  }, [todayCalls, me])

  const myCustomers = useMemo(() => {
    if (!me) return []
    const q = search.trim().toLowerCase()
    return customers
      .filter((c) => c.manager === me.name || c.team_id === me.team_id)
      .filter((c) => {
        if (!q) return true
        return (
          (c.name || '').toLowerCase().includes(q) ||
          (c.phone || '').includes(q)
        )
      })
      .slice(0, 50)
  }, [customers, me, search])

  const openModal = (phone, customer = null) => {
    setModalState({ phone, customer })
    setModalOpen(true)
  }

  const findCustomerByPhone = (phone) =>
    customers.find((c) => c.phone === phone) || null

  if (loading) return <LoadingSpinner />

  // 영업사원 미선택 시: 선택 화면
  if (!me) {
    return (
      <div className="max-w-lg mx-auto py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">CALL-OS</h1>
        <p className="text-sm text-gray-500 mb-6">
          본인 이름을 선택하면 이 기기에서 사용됩니다.
        </p>
        {agents.length === 0 ? (
          <EmptyState
            message="등록된 영업사원이 없습니다. 관리자에게 문의하세요."
            icon={UserPlus}
          />
        ) : (
          <div className="space-y-2">
            {agents.map((a) => (
              <button
                key={a.id}
                onClick={() => setAgentId(a.id)}
                className="w-full flex items-center justify-between px-4 py-4 bg-white border border-gray-200 rounded-xl hover:border-primary hover:bg-primary-light/30 transition-colors text-left"
              >
                <div>
                  <p className="text-base font-semibold text-gray-900">{a.name}</p>
                  <p className="text-xs text-gray-500">
                    {a.teams?.name || '미지정 팀'} · {a.phone}
                  </p>
                </div>
                <ChevronRight size={18} className="text-gray-400" />
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto pb-24">
      {/* Header: agent + refresh */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs text-gray-500">
            {new Date().toLocaleDateString('ko-KR', {
              month: 'long',
              day: 'numeric',
              weekday: 'long',
            })}
          </p>
          <h1 className="text-2xl font-bold text-gray-900">
            안녕하세요, {me.name}님
          </h1>
          <button
            onClick={() => setAgentId(null)}
            className="text-xs text-gray-400 hover:text-gray-600 underline mt-0.5"
          >
            다른 영업사원으로 전환
          </button>
        </div>
        <button
          onClick={load}
          disabled={refreshing}
          className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50"
          title="새로고침"
        >
          <RefreshCw size={18} className={`text-gray-500 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* 부재중 통화 (가장 위에 강조) */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <PhoneOff size={16} className="text-red-500" />
          오늘 부재중
          {myMissedCalls.length > 0 && (
            <Badge variant="danger">{myMissedCalls.length}건</Badge>
          )}
        </h2>
        {myMissedCalls.length === 0 ? (
          <p className="text-sm text-gray-400 px-3">놓친 전화 없음</p>
        ) : (
          <div className="space-y-2">
            {myMissedCalls.map((call) => {
              const cust = findCustomerByPhone(call.customer_phone)
              return (
                <button
                  key={call.id}
                  onClick={() => openModal(call.customer_phone, cust)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-white border border-red-200 rounded-xl hover:bg-red-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                      <PhoneOff size={18} className="text-red-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {cust?.name || '미등록 고객'}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {call.customer_phone} · {formatTime(call.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <a
                      href={`tel:${call.customer_phone}`}
                      onClick={(e) => e.stopPropagation()}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-primary rounded-lg hover:bg-primary-dark"
                    >
                      콜백
                    </a>
                    <ChevronRight size={16} className="text-gray-400" />
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </section>

      {/* 오늘 응답한 통화 */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <PhoneIncoming size={16} className="text-emerald-500" />
          오늘 응답
          {myAnsweredCalls.length > 0 && (
            <Badge variant="success">{myAnsweredCalls.length}건</Badge>
          )}
        </h2>
        {myAnsweredCalls.length === 0 ? (
          <p className="text-sm text-gray-400 px-3">아직 응답한 전화 없음</p>
        ) : (
          <div className="space-y-2">
            {myAnsweredCalls.map((call) => {
              const cust = findCustomerByPhone(call.customer_phone)
              return (
                <button
                  key={call.id}
                  onClick={() => openModal(call.customer_phone, cust)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
                      <Phone size={18} className="text-emerald-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {cust?.name || '미등록 고객'}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {call.customer_phone} · {formatTime(call.created_at)}
                      </p>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />
                </button>
              )
            })}
          </div>
        )}
      </section>

      {/* 내 고객 검색 */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">내 고객</h2>
        <div className="relative mb-3">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="이름 또는 전화번호 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-3 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-primary outline-none"
          />
        </div>
        {myCustomers.length === 0 ? (
          <p className="text-sm text-gray-400 px-3">
            {search ? '검색 결과 없음' : '담당 고객이 없습니다.'}
          </p>
        ) : (
          <div className="space-y-2">
            {myCustomers.map((c) => (
              <button
                key={c.id}
                onClick={() => openModal(c.phone, c)}
                className="w-full flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-left"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {c.name || '미등록'}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{c.phone}</p>
                </div>
                <Badge>{c.status}</Badge>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* FAB: 신규 고객 빠른 등록 */}
      <button
        onClick={() => openModal('', null)}
        className="fixed bottom-6 right-6 z-30 flex items-center gap-2 px-5 py-3 bg-primary text-white rounded-full shadow-lg hover:bg-primary-dark transition-colors"
      >
        <UserPlus size={18} />
        <span className="text-sm font-medium">신규 고객</span>
      </button>

      <QuickCustomerModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={load}
        initialPhone={modalState.phone}
        initialCustomer={modalState.customer}
        defaultManager={me.name}
        defaultTeamId={me.team_id}
      />
    </div>
  )
}
