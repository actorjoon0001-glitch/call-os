import { useEffect, useState } from 'react'
import Modal from './ui/Modal'
import { createCustomer, updateCustomer, getCustomerByPhone } from '../lib/supabase'

const STATUS_OPTIONS = ['신규', '상담중', '계약', '보류']

/**
 * 영업사원 모바일 화면용 빠른 고객 등록/편집 모달
 *
 * 통화 직후 영업사원이 한 화면에서 고객 정보를 빠르게 입력/수정한다.
 * - 신규: phone 만으로도 등록 가능 (이름·메모는 나중에 보강)
 * - 기존: 메모·상태·이름만 빠르게 갱신
 */
export default function QuickCustomerModal({
  open,
  onClose,
  onSaved,
  initialPhone = '',
  initialCustomer = null,
  defaultManager = '',
  defaultTeamId = null,
}) {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    status: '신규',
    memo: '',
    source: '인바운드콜',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    if (initialCustomer) {
      setForm({
        name: initialCustomer.name || '',
        phone: initialCustomer.phone || '',
        status: initialCustomer.status || '신규',
        memo: initialCustomer.memo || '',
        source: initialCustomer.source || '인바운드콜',
      })
    } else {
      setForm({
        name: '',
        phone: initialPhone || '',
        status: '신규',
        memo: '',
        source: '인바운드콜',
      })
    }
  }, [open, initialPhone, initialCustomer])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (initialCustomer?.id) {
        await updateCustomer(initialCustomer.id, {
          name: form.name || null,
          status: form.status,
          memo: form.memo || null,
          manager: defaultManager || initialCustomer.manager || null,
        })
      } else {
        // 동일 번호가 이미 있으면 업데이트로 전환
        const existing = await getCustomerByPhone(form.phone)
        if (existing) {
          await updateCustomer(existing.id, {
            name: form.name || existing.name,
            status: form.status,
            memo: form.memo || existing.memo,
            manager: defaultManager || existing.manager || null,
          })
        } else {
          await createCustomer({
            name: form.name || null,
            phone: form.phone,
            status: form.status,
            memo: form.memo || null,
            source: form.source,
            manager: defaultManager || null,
            team_id: defaultTeamId || null,
          })
        }
      }
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.message || '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initialCustomer ? '고객 정보 수정' : '신규 고객 등록'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">전화번호</label>
          <input
            type="tel"
            required
            inputMode="tel"
            disabled={!!initialCustomer}
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-primary outline-none disabled:bg-gray-50 disabled:text-gray-500"
            placeholder="010-1234-5678"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">고객명</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-primary outline-none"
            placeholder="(선택) 통화 후 입력 가능"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">상태</label>
          <div className="grid grid-cols-4 gap-2">
            {STATUS_OPTIONS.map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => setForm({ ...form, status: s })}
                className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                  form.status === s
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">메모</label>
          <textarea
            value={form.memo}
            onChange={(e) => setForm({ ...form, memo: e.target.value })}
            rows={3}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-primary outline-none resize-none"
            placeholder="문의 내용, 다음 액션 등"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-3 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={saving || !form.phone}
            className="flex-[2] px-4 py-3 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-dark disabled:opacity-50"
          >
            {saving ? '저장 중...' : initialCustomer ? '수정' : '등록'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
