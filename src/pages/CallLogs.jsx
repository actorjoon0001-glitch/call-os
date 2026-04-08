import { useState, useCallback } from 'react'
import { Phone, PhoneOff, Search, Radio } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import Badge from '../components/ui/Badge'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import { useSupabase } from '../hooks/useSupabase'
import { getCallLogs, getShowrooms, getAgents } from '../lib/supabase'

const CALL_STATUS_LABEL = {
  answered: '응답완료',
  missed: '부재중',
  ringing: '연결중',
  failed: '실패',
  voicemail: '음성메시지',
}

export default function CallLogs() {
  const [filters, setFilters] = useState({
    showroom_id: '',
    call_status: '',
    missed_only: false,
    answered_by_agent_id: '',
  })

  const { data: logs, loading } = useSupabase(
    useCallback(() => getCallLogs(filters), [
      filters.showroom_id,
      filters.call_status,
      filters.missed_only,
      filters.answered_by_agent_id,
    ])
  )
  const { data: showrooms } = useSupabase(getShowrooms)
  const { data: agents } = useSupabase(getAgents)

  if (loading) return <LoadingSpinner />

  return (
    <div>
      <PageHeader
        title="통화 로그"
        description="모든 인바운드 통화 기록을 확인하세요"
      />

      {/* 필터 */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          value={filters.showroom_id}
          onChange={e => setFilters(f => ({ ...f, showroom_id: e.target.value }))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
        >
          <option value="">전체 전시장</option>
          {(showrooms || []).map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <select
          value={filters.call_status}
          onChange={e => setFilters(f => ({ ...f, call_status: e.target.value, missed_only: false }))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
        >
          <option value="">전체 상태</option>
          {Object.entries(CALL_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        <select
          value={filters.answered_by_agent_id}
          onChange={e => setFilters(f => ({ ...f, answered_by_agent_id: e.target.value }))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
        >
          <option value="">전체 응답자</option>
          {(agents || []).map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>

        <button
          onClick={() => setFilters(f => ({
            ...f,
            missed_only: !f.missed_only,
            call_status: !f.missed_only ? 'missed' : '',
          }))}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
            filters.missed_only
              ? 'bg-red-50 border-red-200 text-red-700'
              : 'border-gray-300 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <PhoneOff size={14} />
          놓친 전화만
        </button>
      </div>

      {/* 통화 로그 테이블 */}
      {!logs || logs.length === 0 ? (
        <EmptyState message="통화 로그가 없습니다." icon={Phone} />
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>시간</th>
                <th>고객 번호</th>
                <th>전시장</th>
                <th>선택 메뉴</th>
                <th>시도 횟수</th>
                <th>동시울림</th>
                <th>응답자</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id}>
                  <td className="text-gray-500 text-xs">
                    {new Date(log.created_at).toLocaleString('ko-KR')}
                  </td>
                  <td className="font-medium text-gray-900">{log.customer_phone}</td>
                  <td className="text-gray-600">{log.showrooms?.name || '-'}</td>
                  <td>
                    {log.selected_menu ? (
                      <code className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                        {log.selected_menu}
                      </code>
                    ) : '-'}
                  </td>
                  <td className="text-center">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-xs font-medium">
                      {log.ring_attempt_count}
                    </span>
                  </td>
                  <td className="text-center">
                    {log.broadcast_triggered ? (
                      <Badge variant="warning">
                        <Radio size={10} className="mr-1" />
                        발동
                      </Badge>
                    ) : (
                      <span className="text-gray-400 text-xs">-</span>
                    )}
                  </td>
                  <td className="text-gray-600">
                    {log.sales_agents?.name || '-'}
                  </td>
                  <td>
                    <Badge>{CALL_STATUS_LABEL[log.call_status] || log.call_status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
