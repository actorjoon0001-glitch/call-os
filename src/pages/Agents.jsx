import { useState } from 'react'
import { Users, Plus, Pencil, Trash2, GripVertical, ArrowUp, ArrowDown } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import Modal from '../components/ui/Modal'
import Badge from '../components/ui/Badge'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import { useSupabase } from '../hooks/useSupabase'
import {
  getAgents,
  getShowrooms,
  createAgent,
  updateAgent,
  deleteAgent,
  updateAgentPriorities,
} from '../lib/supabase'

export default function Agents() {
  const { data: agents, loading: loadingAgents, refetch } = useSupabase(getAgents)
  const { data: showrooms, loading: loadingSR } = useSupabase(getShowrooms)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [filterShowroom, setFilterShowroom] = useState('')
  const [form, setForm] = useState({
    name: '',
    phone: '',
    showroom_id: '',
    priority: 1,
    is_active: true,
  })
  const [saving, setSaving] = useState(false)

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', phone: '', showroom_id: '', priority: 1, is_active: true })
    setModalOpen(true)
  }

  const openEdit = (a) => {
    setEditing(a)
    setForm({
      name: a.name,
      phone: a.phone,
      showroom_id: a.showroom_id,
      priority: a.priority,
      is_active: a.is_active,
    })
    setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editing) {
        await updateAgent(editing.id, form)
      } else {
        await createAgent(form)
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
      await deleteAgent(id)
      refetch()
    } catch (err) {
      alert('삭제 실패: ' + err.message)
    }
  }

  const movePriority = async (showroomId, agentId, direction) => {
    const srAgents = (agents || [])
      .filter(a => a.showroom_id === showroomId)
      .sort((a, b) => a.priority - b.priority)

    const idx = srAgents.findIndex(a => a.id === agentId)
    if (idx < 0) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= srAgents.length) return

    // Swap
    const temp = srAgents[idx]
    srAgents[idx] = srAgents[swapIdx]
    srAgents[swapIdx] = temp

    try {
      await updateAgentPriorities(srAgents)
      refetch()
    } catch (err) {
      alert('순서 변경 실패: ' + err.message)
    }
  }

  if (loadingAgents || loadingSR) return <LoadingSpinner />

  const filtered = filterShowroom
    ? agents?.filter(a => a.showroom_id === filterShowroom)
    : agents

  const showroomMap = Object.fromEntries((showrooms || []).map(s => [s.id, s.name]))

  // Group by showroom for display
  const grouped = {}
  ;(filtered || []).forEach(a => {
    const srName = showroomMap[a.showroom_id] || '미지정'
    if (!grouped[srName]) grouped[srName] = []
    grouped[srName].push(a)
  })
  Object.values(grouped).forEach(arr => arr.sort((a, b) => a.priority - b.priority))

  return (
    <div>
      <PageHeader
        title="영업팀원 관리"
        description="전시장별 영업팀원 및 순차 연결 순서 관리"
        actions={
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm font-medium"
          >
            <Plus size={16} />
            팀원 추가
          </button>
        }
      />

      {/* Filter */}
      <div className="flex items-center gap-3 mb-4">
        <select
          value={filterShowroom}
          onChange={e => setFilterShowroom(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
        >
          <option value="">전체 전시장</option>
          {(showrooms || []).map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <EmptyState message="등록된 영업팀원이 없습니다." icon={Users} />
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([srName, srAgents]) => (
            <div key={srName}>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <GripVertical size={14} className="text-gray-400" />
                {srName}
                <Badge variant="info">{srAgents.length}명</Badge>
              </h3>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th className="w-16">순번</th>
                      <th>이름</th>
                      <th>휴대폰</th>
                      <th>상태</th>
                      <th>순서 변경</th>
                      <th className="text-right">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {srAgents.map((a, idx) => (
                      <tr key={a.id}>
                        <td>
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary-light text-primary font-bold text-xs">
                            {a.priority}
                          </span>
                        </td>
                        <td className="font-medium text-gray-900">{a.name}</td>
                        <td className="text-gray-600">{a.phone}</td>
                        <td>
                          <Badge variant={a.is_active ? 'success' : 'gray'}>
                            {a.is_active ? '활성' : '비활성'}
                          </Badge>
                        </td>
                        <td>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => movePriority(a.showroom_id, a.id, 'up')}
                              disabled={idx === 0}
                              className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
                              title="위로"
                            >
                              <ArrowUp size={14} className="text-gray-500" />
                            </button>
                            <button
                              onClick={() => movePriority(a.showroom_id, a.id, 'down')}
                              disabled={idx === srAgents.length - 1}
                              className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
                              title="아래로"
                            >
                              <ArrowDown size={14} className="text-gray-500" />
                            </button>
                          </div>
                        </td>
                        <td>
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEdit(a)}
                              className="p-1.5 rounded-lg hover:bg-gray-100"
                              title="수정"
                            >
                              <Pencil size={15} className="text-gray-500" />
                            </button>
                            <button
                              onClick={() => handleDelete(a.id)}
                              className="p-1.5 rounded-lg hover:bg-red-50"
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
            </div>
          ))}
        </div>
      )}

      {/* 등록/수정 모달 */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? '팀원 수정' : '팀원 추가'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
              placeholder="홍길동"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">휴대폰 번호</label>
            <input
              type="tel"
              required
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
              placeholder="010-1234-5678"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">소속 전시장</label>
            <select
              required
              value={form.showroom_id}
              onChange={e => setForm({ ...form, showroom_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
            >
              <option value="">전시장 선택</option>
              {(showrooms || []).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">순번 (priority)</label>
            <input
              type="number"
              min={1}
              required
              value={form.priority}
              onChange={e => setForm({ ...form, priority: parseInt(e.target.value) || 1 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="agent_active"
              checked={form.is_active}
              onChange={e => setForm({ ...form, is_active: e.target.checked })}
              className="rounded border-gray-300"
            />
            <label htmlFor="agent_active" className="text-sm text-gray-700">활성화</label>
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
