import { useState, useCallback } from 'react'
import {
  UserCircle, Plus, Pencil, Search, CalendarCheck, PhoneIncoming, Users,
} from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import Modal from '../components/ui/Modal'
import Badge from '../components/ui/Badge'
import StatCard from '../components/ui/StatCard'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import { useSupabase } from '../hooks/useSupabase'
import {
  getCustomers,
  getCustomerStats,
  getTeams,
  getAgents,
  createCustomer,
  updateCustomer,
} from '../lib/supabase'

const STATUS_OPTIONS = ['신규', '상담중', '계약', '보류']
const KIND_OPTIONS = ['방문예약', '전화유입', '직접등록']

// 유형 탭 정의
const TABS = [
  { key: '', label: '전체' },
  { key: '방문예약', label: '방문예약' },
  { key: '전화유입', label: '전화유입 (CALL-OS)' },
  { key: '직접등록', label: '직접등록' },
]

// 구분 뱃지 색상
const KIND_VARIANT = {
  '방문예약': 'primary',
  '전화유입': 'info',
  '직접등록': 'gray',
}

// ISO 문자열 → datetime-local 입력값 (YYYY-MM-DDTHH:mm)
function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const emptyForm = {
  name: '', phone: '', region: '', content: '', manager: '',
  status: '신규', memo: '', source: '', team_id: '',
  kind: '방문예약', visit_date: '',
}

export default function Customers() {
  const [filters, setFilters] = useState({ search: '', status: '', kind: '', team_id: '', manager: '' })
  const { data: customers, loading, refetch } = useSupabase(
    useCallback(() => getCustomers(filters), [filters])
  )
  const { data: stats, refetch: refetchStats } = useSupabase(getCustomerStats)
  const { data: teams } = useSupabase(getTeams)
  const { data: agents } = useSupabase(getAgents)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const openCreate = () => {
    setEditing(null)
    // 현재 보고 있는 탭이 특정 유형이면 그 유형으로 기본값 설정
    setForm({ ...emptyForm, kind: filters.kind || '방문예약' })
    setModalOpen(true)
  }

  const openEdit = (c) => {
    setEditing(c)
    setForm({
      name: c.name || '',
      phone: c.phone || '',
      region: c.region || '',
      content: c.content || '',
      manager: c.manager || '',
      status: c.status || '신규',
      memo: c.memo || '',
      source: c.source || '',
      team_id: c.team_id || '',
      kind: c.kind || '직접등록',
      visit_date: toLocalInput(c.visit_date),
    })
    setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = { ...form }
      if (!payload.team_id) payload.team_id = null
      // 방문예약일은 방문예약 유형일 때만 저장
      payload.visit_date =
        payload.kind === '방문예약' && payload.visit_date
          ? new Date(payload.visit_date).toISOString()
          : null
      if (editing) {
        await updateCustomer(editing.id, payload)
      } else {
        await createCustomer(payload)
      }
      setModalOpen(false)
      refetch()
      refetchStats()
    } catch (err) {
      alert('저장 실패: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // 담당자 목록 (영업사원 이름)
  const managerNames = [...new Set((agents || []).map(a => a.name))]

  if (loading) return <LoadingSpinner />

  return (
    <div>
      <PageHeader
        title="고객 관리"
        description="방문예약자와 CALL-OS 전화 유입 DB를 한곳에서 관리"
        actions={
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm font-medium"
          >
            <Plus size={16} />
            고객 추가
          </button>
        }
      />

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="전체 고객" value={stats?.total ?? '-'} icon={Users} color="blue" />
        <StatCard label="방문예약" value={stats?.visit ?? '-'} icon={CalendarCheck} color="purple" />
        <StatCard label="전화유입 (CALL-OS)" value={stats?.call ?? '-'} icon={PhoneIncoming} color="green" />
        <StatCard label="이번 달 신규" value={stats?.newThisMonth ?? '-'} icon={UserCircle} color="yellow" />
      </div>

      {/* 유형 탭 */}
      <div className="flex flex-wrap gap-1 mb-4 border-b border-gray-200">
        {TABS.map(t => (
          <button
            key={t.key || 'all'}
            onClick={() => setFilters(f => ({ ...f, kind: t.key }))}
            className={`px-4 py-2 -mb-px text-sm font-medium border-b-2 transition-colors ${
              filters.kind === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 필터 영역 */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="이름 또는 전화번호 검색..."
            value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
          />
        </div>
        <select
          value={filters.status}
          onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
        >
          <option value="">전체 상태</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={filters.team_id}
          onChange={e => setFilters(f => ({ ...f, team_id: e.target.value }))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
        >
          <option value="">전체 팀</option>
          {(teams || []).map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <select
          value={filters.manager}
          onChange={e => setFilters(f => ({ ...f, manager: e.target.value }))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
        >
          <option value="">전체 담당자</option>
          {managerNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      {/* 고객 테이블 */}
      {!customers || customers.length === 0 ? (
        <EmptyState message="조건에 맞는 고객이 없습니다." icon={UserCircle} />
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>구분</th>
                <th>고객명</th>
                <th>전화번호</th>
                <th>팀</th>
                <th>지역</th>
                <th>담당자</th>
                <th>상태</th>
                <th>방문예약일</th>
                <th>유입경로</th>
                <th>등록일</th>
                <th className="text-right">관리</th>
              </tr>
            </thead>
            <tbody>
              {customers.map(c => (
                <tr key={c.id}>
                  <td>
                    <Badge variant={KIND_VARIANT[c.kind] || 'gray'}>{c.kind || '직접등록'}</Badge>
                  </td>
                  <td className="font-medium text-gray-900">{c.name || '-'}</td>
                  <td className="text-gray-600">{c.phone}</td>
                  <td className="text-gray-600">{c.teams?.name || '-'}</td>
                  <td className="text-gray-600">{c.region || '-'}</td>
                  <td className="text-gray-600">{c.manager || '-'}</td>
                  <td><Badge>{c.status}</Badge></td>
                  <td className="text-gray-500 text-xs">
                    {c.visit_date
                      ? new Date(c.visit_date).toLocaleString('ko-KR', {
                          month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
                        })
                      : '-'}
                  </td>
                  <td className="text-gray-500 text-xs">{c.source || '-'}</td>
                  <td className="text-gray-500 text-xs">
                    {new Date(c.created_at).toLocaleDateString('ko-KR')}
                  </td>
                  <td>
                    <div className="flex justify-end">
                      <button
                        onClick={() => openEdit(c)}
                        className="p-1.5 rounded-lg hover:bg-gray-100"
                        title="수정"
                      >
                        <Pencil size={15} className="text-gray-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 고객 등록/수정 모달 */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? '고객 수정' : '고객 추가'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">구분</label>
            <select
              value={form.kind}
              onChange={e => setForm({ ...form, kind: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
            >
              {KIND_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          {form.kind === '방문예약' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">방문 예약 일시</label>
              <input
                type="datetime-local"
                value={form.visit_date}
                onChange={e => setForm({ ...form, visit_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">고객명</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">전화번호</label>
            <input
              type="tel"
              required
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">팀</label>
            <select
              value={form.team_id}
              onChange={e => setForm({ ...form, team_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
            >
              <option value="">선택</option>
              {(teams || []).map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">지역</label>
            <input
              type="text"
              value={form.region}
              onChange={e => setForm({ ...form, region: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">담당자</label>
            <input
              type="text"
              value={form.manager}
              onChange={e => setForm({ ...form, manager: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">상태</label>
            <select
              value={form.status}
              onChange={e => setForm({ ...form, status: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
            >
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">유입경로</label>
            <input
              type="text"
              value={form.source}
              onChange={e => setForm({ ...form, source: e.target.value })}
              placeholder="예: 네이버광고, 방문예약, 대표번호 수신"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">문의내용</label>
            <textarea
              value={form.content}
              onChange={e => setForm({ ...form, content: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none resize-none"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">메모</label>
            <textarea
              value={form.memo}
              onChange={e => setForm({ ...form, memo: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none resize-none"
            />
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary-dark disabled:opacity-50"
            >
              {saving ? '저장 중...' : editing ? '수정' : '추가'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
