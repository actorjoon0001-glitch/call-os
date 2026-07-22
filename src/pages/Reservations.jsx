import { useState, useCallback } from 'react'
import { CalendarCheck, Plus, Pencil, Search, Check, X, Trash2 } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import Modal from '../components/ui/Modal'
import Badge from '../components/ui/Badge'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import { useSupabase } from '../hooks/useSupabase'
import {
  getReservations,
  getTeams,
  createReservation,
  updateReservation,
  deleteReservation,
} from '../lib/supabase'

const STATUS_OPTIONS = ['요청', '확정', '취소', '방문완료', '노쇼']

const emptyForm = {
  customer_name: '', customer_phone: '', team_id: '',
  preferred_date: '', preferred_time: '', purpose: '', status: '요청', memo: '',
}

export default function Reservations() {
  const [filters, setFilters] = useState({ search: '', status: '' })
  const { data: reservations, loading, refetch } = useSupabase(
    useCallback(() => getReservations(filters), [filters])
  )
  const { data: teams } = useSupabase(getTeams)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  const openEdit = (r) => {
    setEditing(r)
    setForm({
      customer_name: r.customer_name || '',
      customer_phone: r.customer_phone || '',
      team_id: r.team_id || '',
      preferred_date: r.preferred_date || '',
      preferred_time: r.preferred_time || '',
      purpose: r.purpose || '',
      status: r.status || '요청',
      memo: r.memo || '',
    })
    setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = { ...form }
      if (!payload.team_id) payload.team_id = null
      if (!payload.preferred_date) payload.preferred_date = null
      if (editing) {
        await updateReservation(editing.id, payload)
      } else {
        await createReservation({ ...payload, source: '수기등록' })
      }
      setModalOpen(false)
      refetch()
    } catch (err) {
      alert('저장 실패: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const changeStatus = async (r, status) => {
    try {
      await updateReservation(r.id, { status })
      refetch()
    } catch (err) {
      alert('상태 변경 실패: ' + err.message)
    }
  }

  const handleDelete = async (r) => {
    if (!confirm(`${r.customer_name || r.customer_phone} 님의 예약을 삭제할까요?`)) return
    try {
      await deleteReservation(r.id)
      refetch()
    } catch (err) {
      alert('삭제 실패: ' + err.message)
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <div>
      <PageHeader
        title="방문예약 관리"
        description="AI 안내원이 접수한 방문 상담 예약을 확인하고 관리하세요"
        actions={
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm font-medium"
          >
            <Plus size={16} />
            예약 추가
          </button>
        }
      />

      {/* 필터 */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="고객명 또는 전화번호 검색..."
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
      </div>

      {/* 예약 테이블 */}
      {!reservations || reservations.length === 0 ? (
        <EmptyState message="접수된 방문예약이 없습니다." icon={CalendarCheck} />
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>고객명</th>
                <th>전화번호</th>
                <th>희망일</th>
                <th>희망시간</th>
                <th>방문목적</th>
                <th>팀</th>
                <th>상태</th>
                <th>유입</th>
                <th>접수일</th>
                <th className="text-right">관리</th>
              </tr>
            </thead>
            <tbody>
              {reservations.map(r => (
                <tr key={r.id}>
                  <td className="font-medium text-gray-900">{r.customer_name || '-'}</td>
                  <td className="text-gray-600">{r.customer_phone}</td>
                  <td className="text-gray-600">{r.preferred_date || '-'}</td>
                  <td className="text-gray-600">{r.preferred_time || '-'}</td>
                  <td className="text-gray-600 max-w-[200px] truncate" title={r.purpose || ''}>
                    {r.purpose || '-'}
                  </td>
                  <td className="text-gray-600">{r.teams?.name || '-'}</td>
                  <td><Badge>{r.status}</Badge></td>
                  <td className="text-gray-500 text-xs">{r.source || '-'}</td>
                  <td className="text-gray-500 text-xs">
                    {new Date(r.created_at).toLocaleDateString('ko-KR')}
                  </td>
                  <td>
                    <div className="flex justify-end gap-1">
                      {r.status === '요청' && (
                        <button
                          onClick={() => changeStatus(r, '확정')}
                          className="p-1.5 rounded-lg hover:bg-emerald-50"
                          title="예약 확정"
                        >
                          <Check size={15} className="text-emerald-600" />
                        </button>
                      )}
                      {(r.status === '요청' || r.status === '확정') && (
                        <button
                          onClick={() => changeStatus(r, '취소')}
                          className="p-1.5 rounded-lg hover:bg-red-50"
                          title="예약 취소"
                        >
                          <X size={15} className="text-red-500" />
                        </button>
                      )}
                      <button
                        onClick={() => openEdit(r)}
                        className="p-1.5 rounded-lg hover:bg-gray-100"
                        title="수정"
                      >
                        <Pencil size={15} className="text-gray-500" />
                      </button>
                      <button
                        onClick={() => handleDelete(r)}
                        className="p-1.5 rounded-lg hover:bg-gray-100"
                        title="삭제"
                      >
                        <Trash2 size={15} className="text-gray-400" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 예약 등록/수정 모달 */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? '예약 수정' : '예약 추가'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">고객명</label>
            <input
              type="text"
              value={form.customer_name}
              onChange={e => setForm({ ...form, customer_name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">전화번호</label>
            <input
              type="tel"
              required
              value={form.customer_phone}
              onChange={e => setForm({ ...form, customer_phone: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">희망 날짜</label>
            <input
              type="date"
              value={form.preferred_date}
              onChange={e => setForm({ ...form, preferred_date: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">희망 시간</label>
            <input
              type="text"
              placeholder="예: 오후 2시"
              value={form.preferred_time}
              onChange={e => setForm({ ...form, preferred_time: e.target.value })}
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
            <label className="block text-sm font-medium text-gray-700 mb-1">상태</label>
            <select
              value={form.status}
              onChange={e => setForm({ ...form, status: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
            >
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">방문 목적</label>
            <input
              type="text"
              value={form.purpose}
              onChange={e => setForm({ ...form, purpose: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
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
