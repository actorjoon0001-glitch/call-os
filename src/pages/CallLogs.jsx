import { useState, useCallback, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Phone, PhoneOff, Radio, Plus, Mic, MicOff } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import Modal from '../components/ui/Modal'
import Badge from '../components/ui/Badge'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import { useSupabase } from '../hooks/useSupabase'
import { getCallLogs, getTeams, getAgents, saveManualCallLog } from '../lib/supabase'

const CALL_STATUS_LABEL = {
  answered: '응답완료',
  missed: '부재중',
  ringing: '연결중',
  failed: '실패',
  voicemail: '음성메시지',
}

const RESERVATION_ENDPOINT = '/.netlify/functions/save-reservation'

const emptyForm = {
  phone: '', name: '', status: 'answered', team_id: '', note: '',
  makeReservation: false, interested_size: '', pref_date: '', pref_time: '',
}

const SpeechRecognition =
  typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null

export default function CallLogs() {
  const [filters, setFilters] = useState({
    team_id: '',
    call_status: '',
    missed_only: false,
    answered_by_agent_id: '',
  })

  const { data: logs, loading, refetch } = useSupabase(
    useCallback(() => getCallLogs(filters), [filters])
  )
  const { data: teams } = useSupabase(getTeams)
  const { data: agents } = useSupabase(getAgents)

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [listening, setListening] = useState(false)
  const recRef = useRef(null)

  // URL 파라미터로 통화기록 자동 열기 (예: /call-logs?log=1&phone=010...)
  // → 안드로이드 자동화 앱에서 "통화 종료 시 이 주소 열기"로 활용
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    const log = searchParams.get('log')
    const phone = searchParams.get('phone')
    if (log === '1' || phone) {
      setForm({ ...emptyForm, phone: phone || '' })
      setModalOpen(true)
      setSearchParams({}, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openModal = () => { setForm(emptyForm); setModalOpen(true) }

  const toggleVoice = () => {
    if (!SpeechRecognition) {
      alert('이 브라우저는 음성 입력을 지원하지 않습니다. (크롬/안드로이드 권장)')
      return
    }
    if (listening) {
      recRef.current?.stop()
      return
    }
    const rec = new SpeechRecognition()
    rec.lang = 'ko-KR'
    rec.continuous = true
    rec.interimResults = false
    rec.onresult = (e) => {
      let text = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) text += e.results[i][0].transcript
      }
      if (text) setForm(f => ({ ...f, note: f.note ? `${f.note} ${text}` : text }))
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recRef.current = rec
    rec.start()
    setListening(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (listening) recRef.current?.stop()
    setSaving(true)
    try {
      await saveManualCallLog({
        phone: form.phone,
        name: form.name,
        status: form.status,
        team_id: form.team_id || null,
        note: form.note,
      })

      if (form.makeReservation) {
        const teamName = (teams || []).find(t => t.id === form.team_id)?.name
        await fetch(RESERVATION_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name,
            phone: form.phone,
            showroom: teamName,
            interested_size: form.interested_size,
            date: form.pref_date,
            time: form.pref_time,
            source: '직접통화',
          }),
        }).catch(() => {})
      }

      setModalOpen(false)
      refetch()
    } catch (err) {
      alert('저장 실패: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <div>
      <PageHeader
        title="통화 로그"
        description="통화한 직원이 직접 기록하거나, AI/인바운드 통화를 확인하세요"
        actions={
          <button
            onClick={openModal}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm font-medium"
          >
            <Plus size={16} />
            통화 기록
          </button>
        }
      />

      {/* 필터 */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
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
                <th>팀</th>
                <th>내용</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id}>
                  <td className="text-gray-500 text-xs whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString('ko-KR')}
                  </td>
                  <td className="font-medium text-gray-900">{log.customer_phone}</td>
                  <td className="text-gray-600">{log.teams?.name || '-'}</td>
                  <td className="text-gray-600 max-w-[320px] truncate" title={log.note || ''}>
                    {log.note || '-'}
                  </td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <Badge>{CALL_STATUS_LABEL[log.call_status] || log.call_status}</Badge>
                      {log.broadcast_triggered && (
                        <Badge variant="warning"><Radio size={10} className="mr-1" />동시</Badge>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 통화 기록 입력 모달 */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="통화 기록 추가" size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">전화번호 *</label>
              <input
                type="tel"
                required
                autoFocus
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                placeholder="010-0000-0000"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
              />
            </div>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">상태</label>
              <select
                value={form.status}
                onChange={e => setForm({ ...form, status: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
              >
                <option value="answered">응답완료</option>
                <option value="missed">부재중</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">담당 전시장</label>
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
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">통화 내용</label>
              <button
                type="button"
                onClick={toggleVoice}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors ${
                  listening
                    ? 'bg-red-50 border-red-300 text-red-600 animate-pulse'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {listening ? <MicOff size={13} /> : <Mic size={13} />}
                {listening ? '듣는 중… (누르면 중지)' : '음성 입력'}
              </button>
            </div>
            <textarea
              value={form.note}
              onChange={e => setForm({ ...form, note: e.target.value })}
              rows={4}
              placeholder="통화 내용을 적거나, '음성 입력'을 눌러 말로 기록하세요."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none resize-none"
            />
          </div>

          {/* 방문예약 함께 등록 */}
          <div className="rounded-xl border border-gray-200 p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                checked={form.makeReservation}
                onChange={e => setForm({ ...form, makeReservation: e.target.checked })}
                className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              방문예약도 함께 등록 (담당 전시장 팀장에게 문자 발송)
            </label>
            {form.makeReservation && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                <input
                  type="text"
                  value={form.interested_size}
                  onChange={e => setForm({ ...form, interested_size: e.target.value })}
                  placeholder="관심 평형 (예: 20평)"
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
                />
                <input
                  type="date"
                  value={form.pref_date}
                  onChange={e => setForm({ ...form, pref_date: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
                />
                <input
                  type="text"
                  value={form.pref_time}
                  onChange={e => setForm({ ...form, pref_time: e.target.value })}
                  placeholder="희망 시간 (예: 오후 2시)"
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
                />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
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
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
