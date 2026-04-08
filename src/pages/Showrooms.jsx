import { useState } from 'react'
import { Building2, Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import Modal from '../components/ui/Modal'
import Badge from '../components/ui/Badge'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import { useSupabase } from '../hooks/useSupabase'
import { getShowrooms, createShowroom, updateShowroom, deleteShowroom } from '../lib/supabase'

export default function Showrooms() {
  const { data: showrooms, loading, refetch } = useSupabase(getShowrooms)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', code: '', is_active: true })
  const [saving, setSaving] = useState(false)

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', code: '', is_active: true })
    setModalOpen(true)
  }

  const openEdit = (s) => {
    setEditing(s)
    setForm({ name: s.name, code: s.code, is_active: s.is_active })
    setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editing) {
        await updateShowroom(editing.id, form)
      } else {
        await createShowroom(form)
      }
      setModalOpen(false)
      refetch()
    } catch (err) {
      alert('저장 실패: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    try {
      await deleteShowroom(id)
      refetch()
    } catch (err) {
      alert('삭제 실패: ' + err.message)
    }
  }

  const toggleActive = async (s) => {
    try {
      await updateShowroom(s.id, { is_active: !s.is_active })
      refetch()
    } catch (err) {
      alert('상태 변경 실패: ' + err.message)
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <div>
      <PageHeader
        title="전시장 관리"
        description="전시장 등록 및 활성/비활성 관리"
        actions={
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm font-medium"
          >
            <Plus size={16} />
            전시장 추가
          </button>
        }
      />

      {!showrooms || showrooms.length === 0 ? (
        <EmptyState message="등록된 전시장이 없습니다." icon={Building2} />
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>전시장명</th>
                <th>코드</th>
                <th>상태</th>
                <th>등록일</th>
                <th className="text-right">관리</th>
              </tr>
            </thead>
            <tbody>
              {showrooms.map(s => (
                <tr key={s.id}>
                  <td className="font-medium text-gray-900">{s.name}</td>
                  <td>
                    <code className="text-xs bg-gray-100 px-2 py-0.5 rounded">{s.code}</code>
                  </td>
                  <td>
                    <button onClick={() => toggleActive(s)} className="flex items-center gap-1">
                      {s.is_active ? (
                        <>
                          <ToggleRight size={20} className="text-emerald-500" />
                          <Badge variant="success">활성</Badge>
                        </>
                      ) : (
                        <>
                          <ToggleLeft size={20} className="text-gray-400" />
                          <Badge variant="gray">비활성</Badge>
                        </>
                      )}
                    </button>
                  </td>
                  <td>{new Date(s.created_at).toLocaleDateString('ko-KR')}</td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(s)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                        title="수정"
                      >
                        <Pencil size={15} className="text-gray-500" />
                      </button>
                      <button
                        onClick={() => handleDelete(s.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                        title="삭제"
                      >
                        <Trash2 size={15} className="text-red-400" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 등록/수정 모달 */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? '전시장 수정' : '전시장 추가'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">전시장명</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              placeholder="예: 김포전시장"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">전시장 코드</label>
            <input
              type="text"
              required
              value={form.code}
              onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              placeholder="예: GIMPO"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={form.is_active}
              onChange={e => setForm({ ...form, is_active: e.target.checked })}
              className="rounded border-gray-300"
            />
            <label htmlFor="is_active" className="text-sm text-gray-700">활성화</label>
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
              {saving ? '저장 중...' : editing ? '수정' : '추가'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
