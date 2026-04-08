import { useState, useCallback } from 'react'
import { MessageSquare, Plus } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import Modal from '../components/ui/Modal'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import { useSupabase } from '../hooks/useSupabase'
import { getConsultLogs, getCustomers, createConsultLog } from '../lib/supabase'

export default function ConsultLogs() {
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const { data: logs, loading, refetch } = useSupabase(
    useCallback(() => getConsultLogs(selectedCustomer || undefined), [selectedCustomer])
  )
  const { data: customers } = useSupabase(useCallback(() => getCustomers(), []))
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ customer_id: '', manager: '', content: '', memo: '' })
  const [saving, setSaving] = useState(false)

  const openCreate = () => {
    setForm({ customer_id: selectedCustomer || '', manager: '', content: '', memo: '' })
    setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await createConsultLog(form)
      setModalOpen(false)
      refetch()
    } catch (err) {
      alert('저장 실패: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const customerMap = Object.fromEntries((customers || []).map(c => [c.id, c]))

  if (loading) return <LoadingSpinner />

  return (
    <div>
      <PageHeader
        title="상담 이력"
        description="고객별 상담 내역을 기록하고 관리합니다"
        actions={
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm font-medium"
          >
            <Plus size={16} />
            상담 추가
          </button>
        }
      />

      {/* 고객 필터 */}
      <div className="flex items-center gap-3 mb-4">
        <select
          value={selectedCustomer}
          onChange={e => setSelectedCustomer(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none min-w-[200px]"
        >
          <option value="">전체 고객</option>
          {(customers || []).map(c => (
            <option key={c.id} value={c.id}>
              {c.name || '미등록'} ({c.phone})
            </option>
          ))}
        </select>
      </div>

      {/* 상담 이력 목록 */}
      {!logs || logs.length === 0 ? (
        <EmptyState message="상담 이력이 없습니다." icon={MessageSquare} />
      ) : (
        <div className="space-y-3">
          {logs.map(log => {
            const customer = customerMap[log.customer_id]
            return (
              <div
                key={log.id}
                className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <span className="text-sm font-semibold text-gray-900">
                      {customer?.name || '미등록 고객'}
                    </span>
                    <span className="text-xs text-gray-400 ml-2">
                      {customer?.phone}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">
                      {new Date(log.created_at).toLocaleString('ko-KR')}
                    </p>
                    {log.manager && (
                      <p className="text-xs text-gray-500 mt-0.5">담당: {log.manager}</p>
                    )}
                  </div>
                </div>
                {log.content && (
                  <p className="text-sm text-gray-700 mb-2">{log.content}</p>
                )}
                {log.memo && (
                  <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2">
                    메모: {log.memo}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 상담 추가 모달 */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="상담 이력 추가"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">고객</label>
            <select
              required
              value={form.customer_id}
              onChange={e => setForm({ ...form, customer_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
            >
              <option value="">고객 선택</option>
              {(customers || []).map(c => (
                <option key={c.id} value={c.id}>
                  {c.name || '미등록'} ({c.phone})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">담당자</label>
            <input
              type="text"
              value={form.manager}
              onChange={e => setForm({ ...form, manager: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
              placeholder="홍길동"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">상담 내용</label>
            <textarea
              value={form.content}
              onChange={e => setForm({ ...form, content: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none resize-none"
              placeholder="상담 내용을 입력하세요..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">메모</label>
            <textarea
              value={form.memo}
              onChange={e => setForm({ ...form, memo: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none resize-none"
              placeholder="추가 메모..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
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
              {saving ? '저장 중...' : '추가'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
