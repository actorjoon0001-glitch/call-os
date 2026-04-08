import { useState, useCallback } from 'react'
import { UserCircle, Plus, Pencil, Search, Filter } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import Modal from '../components/ui/Modal'
import Badge from '../components/ui/Badge'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import { useSupabase } from '../hooks/useSupabase'
import {
  getCustomers,
  getShowrooms,
  getAgents,
  createCustomer,
  updateCustomer,
} from '../lib/supabase'

const STATUS_OPTIONS = ['신규', '상담중', '계약', '보류']

export default function Customers() {
  const [filters, setFilters] = useState({ search: '', status: '', showroom_id: '', manager: '' })
  const { data: customers, loading, refetch } = useSupabase(
    useCallback(() => getCustomers(filters), [filters.search, filters.status, filters.showroom_id, filters.manager])
  )
  const { data: showrooms } = useSupabase(getShowrooms)
  const { data: agents } = useSupabase(getAgents)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({
    name: '', phone: '', region: '', content: '', manager: '',
    status: '신규', memo: '', source: '', showroom_id: '',
  })
  const [saving, setSaving] = useState(false)

  const openCreate = () => {
    setEditing(null)
    setForm({
      name: '', phone: '', region: '', content: '', manager: '',
      status: '신규', memo: '', source: '', showroom_id: '',
    })
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
      showroom_id: c.showroom_id || '',
    })
    setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = { ...form }
      if (!payload.showroom_id) payload.showroom_id = null
      if (editing) {
        await updateCustomer(editing.id, payload)
      } else {
        await createCustomer(payload)
      }
      setModalOpen(false)
      refetch()
    } catch (err) {
      alert('저장 실패: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // Unique managers from agents
  const managerNames = [...new Set((agents || []).map(a => a.name))]

  if (loading) return <LoadingSpinner />

  return (
    <div>
      <PageHeader
        title="고객 관리"
        description="고객 정보 조회 및 관리"
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
                <th>고객명</th>
                <th>전화번호</th>
                <th>전시장</th>
                <th>지역</th>
                <th>담당자</th>
                <th>상태</th>
                <th>유입경로</th>
                <th>등록일</th>
                <th className="text-right">관리</th>
              </tr>
            </thead>
            <tbody>
              {customers.map(c => (
                <tr key={c.id}>
                  <td className="font-medium text-gray-900">{c.name || '-'}</td>
                  <td className="text-gray-600">{c.phone}</td>
                  <td className="text-gray-600">{c.showrooms?.name || '-'}</td>
                  <td className="text-gray-600">{c.region || '-'}</td>
                  <td className="text-gray-600">{c.manager || '-'}</td>
                  <td><Badge>{c.status}</Badge></td>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">전시장</label>
            <select
              value={form.showroom_id}
              onChange={e => setForm({ ...form, showroom_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
            >
              <option value="">선택</option>
              {(showrooms || []).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
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
