import { useState, useEffect } from 'react'
import { Phone, PhoneOff, PhoneCall, PhoneIncoming, Building2, Users } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import StatCard from '../components/ui/StatCard'
import Badge from '../components/ui/Badge'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { getDashboardStats, getCallLogs, getTeams, getAgents } from '../lib/supabase'

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [recentCalls, setRecentCalls] = useState([])
  const [teams, setTeams] = useState([])
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [s, calls, tm, ag] = await Promise.all([
          getDashboardStats(),
          getCallLogs(),
          getTeams(),
          getAgents(),
        ])
        setStats(s)
        setRecentCalls(calls?.slice(0, 10) || [])
        setTeams(tm || [])
        setAgents(ag || [])
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return <LoadingSpinner />

  // 팀별 통화 수
  const teamStats = teams.map(t => ({
    name: t.name,
    count: stats?.byTeam?.[t.id] || 0,
  }))

  // 담당자별 응답 수
  const agentStats = agents
    .filter(a => stats?.byAgent?.[a.id])
    .map(a => ({ name: a.name, count: stats.byAgent[a.id] }))
    .sort((a, b) => b.count - a.count)

  const callStatusLabel = {
    answered: '응답완료',
    missed: '부재중',
    ringing: '연결중',
    failed: '실패',
    voicemail: '음성메시지',
  }

  return (
    <div>
      <PageHeader title="대시보드" description="오늘의 콜센터 현황을 한눈에 확인하세요" />

      {/* 주요 지표 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="오늘 총 인바운드"
          value={stats?.total || 0}
          icon={PhoneIncoming}
          color="blue"
          sub="건"
        />
        <StatCard
          label="응답 완료"
          value={stats?.answered || 0}
          icon={PhoneCall}
          color="green"
          sub="건"
        />
        <StatCard
          label="놓친 전화"
          value={stats?.missed || 0}
          icon={PhoneOff}
          color="red"
          sub="건"
        />
        <StatCard
          label="응답률"
          value={stats?.total ? Math.round((stats.answered / stats.total) * 100) + '%' : '-'}
          icon={Phone}
          color="purple"
          sub={stats?.total ? `${stats.answered}/${stats.total}` : ''}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* 팀별 통화 현황 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Building2 size={16} />
            팀별 통화 수
          </h3>
          {teamStats.length === 0 ? (
            <p className="text-sm text-gray-400">데이터 없음</p>
          ) : (
            <div className="space-y-3">
              {teamStats.map(t => (
                <div key={t.name} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{t.name}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-32 bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-primary rounded-full h-2 transition-all"
                        style={{
                          width: `${stats?.total ? (t.count / stats.total) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-gray-900 w-8 text-right">
                      {t.count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 담당자별 응답 현황 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Users size={16} />
            담당자별 응답 수
          </h3>
          {agentStats.length === 0 ? (
            <p className="text-sm text-gray-400">데이터 없음</p>
          ) : (
            <div className="space-y-3">
              {agentStats.map(a => (
                <div key={a.name} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{a.name}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-32 bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-emerald-500 rounded-full h-2 transition-all"
                        style={{
                          width: `${stats?.answered ? (a.count / stats.answered) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-gray-900 w-8 text-right">
                      {a.count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 최근 통화 내역 */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700">최근 통화 내역</h3>
        </div>
        {recentCalls.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">통화 내역이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">시간</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">고객번호</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">팀</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">응답자</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">상태</th>
                </tr>
              </thead>
              <tbody>
                {recentCalls.map(call => (
                  <tr key={call.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(call.created_at).toLocaleString('ko-KR')}
                    </td>
                    <td className="px-4 py-3 text-gray-900 font-medium">{call.customer_phone}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {call.teams?.name || call.selected_menu || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {call.sales_agents?.name || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge>{callStatusLabel[call.call_status] || call.call_status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
