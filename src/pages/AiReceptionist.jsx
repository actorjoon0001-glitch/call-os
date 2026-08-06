import { useState, useCallback, useEffect, useRef } from 'react'
import { Bot, Save, MessageSquare, ChevronDown, ChevronRight, Send, RotateCcw, Sparkles, CalendarCheck } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import Badge from '../components/ui/Badge'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import { useSupabase } from '../hooks/useSupabase'
import { getAiSettings, updateAiSettings, getAiSessions } from '../lib/supabase'

const OUTCOME_LABEL = {
  booked: '예약완료',
  transferred: '상담연결',
  ended: '종료',
  in_progress: '진행중',
  failed: '오류',
}

const SIM_ENDPOINT = '/.netlify/functions/ai-sim'

const ACTION_LABEL = {
  continue: '대화 진행',
  book: '예약 확정',
  transfer: '상담원 연결',
  goodbye: '통화 종료',
}

const ACTION_VARIANT = {
  continue: 'info',
  book: 'success',
  transfer: 'primary',
  goodbye: 'gray',
}

/**
 * AI 안내원 텍스트 시뮬레이터
 * 실제 전화와 동일한 시스템 프롬프트/모델로 대화를 미리 체험·튜닝한다.
 * (Netlify Function /.netlify/functions/ai-sim 호출 — 배포 환경에서 동작)
 */
function Simulator({ settings }) {
  const greeting = settings
    ? `안녕하세요, ${settings.company_name || '우리회사'}입니다. ${settings.greeting || ''}`.trim()
    : '안녕하세요, 무엇을 도와드릴까요?'

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [lastAction, setLastAction] = useState(null)
  const [booking, setBooking] = useState(null)
  const [ended, setEnded] = useState(false)
  const scrollRef = useRef(null)

  const reset = useCallback(() => {
    setMessages([{ role: 'assistant', content: greeting }])
    setInput('')
    setBusy(false)
    setLastAction(null)
    setBooking(null)
    setEnded(false)
  }, [greeting])

  // 설정 로드/변경 시 인사말로 초기화
  useEffect(() => { reset() }, [reset])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, busy])

  const send = async () => {
    const text = input.trim()
    if (!text || busy || ended) return
    const next = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setInput('')
    setBusy(true)
    try {
      const res = await fetch(SIM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings, messages: next }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setMessages([...next, { role: 'assistant', content: data.say }])
      setLastAction(data.action)
      if (data.action === 'book') { setBooking(data.booking); setEnded(true) }
      if (data.action === 'goodbye' || data.action === 'transfer') setEnded(true)
    } catch {
      setMessages([...next, {
        role: 'assistant',
        content: '(시뮬레이터 호출 실패) 배포 환경(Netlify)에서만 동작합니다. 로컬 개발 서버에서는 응답하지 않습니다. 또한 Netlify 환경변수 ANTHROPIC_API_KEY가 설정돼 있어야 합니다.',
      }])
      setEnded(true)
    } finally {
      setBusy(false)
    }
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">고객 입장에서 대화해 보세요</span>
          {lastAction && (
            <Badge variant={ACTION_VARIANT[lastAction] || 'gray'}>{ACTION_LABEL[lastAction] || lastAction}</Badge>
          )}
        </div>
        <button
          onClick={reset}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 px-2 py-1 rounded-lg hover:bg-gray-100"
        >
          <RotateCcw size={13} /> 처음부터
        </button>
      </div>

      <div ref={scrollRef} className="px-4 py-4 space-y-2 h-80 overflow-y-auto bg-gray-50/50">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-primary text-white rounded-br-sm'
                  : 'bg-white border border-gray-200 text-gray-700 rounded-bl-sm'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="px-3 py-2 rounded-2xl bg-white border border-gray-200 text-gray-400 text-sm">
              입력 중…
            </div>
          </div>
        )}

        {booking && (
          <div className="mt-3 p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-sm">
            <div className="flex items-center gap-1.5 font-semibold text-emerald-700 mb-2">
              <CalendarCheck size={15} /> 예약 정보 추출됨
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-emerald-900">
              <span>성함: {booking.name || '-'}</span>
              <span>날짜: {booking.date || '-'}</span>
              <span>시간: {booking.time || '-'}</span>
              <span>목적: {booking.purpose || '-'}</span>
            </div>
            <p className="mt-2 text-xs text-emerald-600">※ 시뮬레이터에서는 실제 예약으로 저장되지 않습니다.</p>
          </div>
        )}
        {ended && !booking && (
          <p className="text-center text-xs text-gray-400 pt-2">대화가 종료되었습니다. "처음부터"로 다시 시작하세요.</p>
        )}
      </div>

      <div className="flex items-center gap-2 px-3 py-3 border-t border-gray-100">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={busy || ended}
          placeholder={ended ? '대화가 종료되었습니다' : '고객이 하는 말을 입력…'}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none disabled:bg-gray-50"
        />
        <button
          onClick={send}
          disabled={busy || ended || !input.trim()}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm font-medium disabled:opacity-50"
        >
          <Send size={15} /> 전송
        </button>
      </div>
    </div>
  )
}

function SettingsForm({ settings, onSaved }) {
  const [form, setForm] = useState({
    company_name: settings?.company_name || '',
    greeting: settings?.greeting || '',
    persona: settings?.persona || '',
    business_hours: settings?.business_hours || '',
    address: settings?.address || '',
    booking_enabled: settings?.booking_enabled ?? true,
    fallback_to_human: settings?.fallback_to_human ?? true,
    max_turns: settings?.max_turns || 8,
  })
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await updateAiSettings({ ...form, max_turns: parseInt(form.max_turns, 10) || 8 })
      setSavedAt(new Date())
      onSaved?.()
    } catch (err) {
      alert('저장 실패: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">회사명</label>
          <input
            type="text"
            value={form.company_name}
            onChange={e => setForm({ ...form, company_name: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">영업시간</label>
          <input
            type="text"
            placeholder="예: 평일 09:00 ~ 18:00"
            value={form.business_hours}
            onChange={e => setForm({ ...form, business_hours: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">첫 인사말</label>
        <textarea
          value={form.greeting}
          onChange={e => setForm({ ...form, greeting: e.target.value })}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none resize-none"
        />
        <p className="mt-1 text-xs text-gray-400">전화 연결 직후 AI가 읽어주는 첫 멘트입니다.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">안내원 말투/지침 (페르소나)</label>
        <textarea
          value={form.persona}
          onChange={e => setForm({ ...form, persona: e.target.value })}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none resize-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">주소</label>
        <input
          type="text"
          value={form.address}
          onChange={e => setForm({ ...form, address: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={form.booking_enabled}
            onChange={e => setForm({ ...form, booking_enabled: e.target.checked })}
            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          AI 안내원 사용
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={form.fallback_to_human}
            onChange={e => setForm({ ...form, fallback_to_human: e.target.checked })}
            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          요청 시 상담원 연결
        </label>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">최대 대화 턴</label>
          <input
            type="number"
            min={1}
            max={20}
            value={form.max_turns}
            onChange={e => setForm({ ...form, max_turns: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        {savedAt && (
          <span className="text-xs text-emerald-600">
            {savedAt.toLocaleTimeString('ko-KR')} 저장됨
          </span>
        )}
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary-dark disabled:opacity-50"
        >
          <Save size={16} />
          {saving ? '저장 중...' : '설정 저장'}
        </button>
      </div>
    </form>
  )
}

function SessionRow({ session }) {
  const [open, setOpen] = useState(false)
  const turns = Array.isArray(session.transcript) ? session.transcript : []

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-left"
      >
        <div className="flex items-center gap-3">
          {open ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
          <div>
            <p className="text-sm font-medium text-gray-900">{session.customer_phone || '알 수 없음'}</p>
            <p className="text-xs text-gray-400">
              {new Date(session.created_at).toLocaleString('ko-KR')} · {turns.length}턴
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {session.intent && <span className="text-xs text-gray-500">{session.intent}</span>}
          <Badge>{OUTCOME_LABEL[session.outcome] || session.outcome}</Badge>
        </div>
      </button>
      {open && (
        <div className="px-4 py-3 border-t border-gray-100 space-y-2 bg-gray-50/50">
          {turns.length === 0 ? (
            <p className="text-xs text-gray-400">대화 내용이 없습니다.</p>
          ) : (
            turns.map((t, i) => (
              <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${
                    t.role === 'user'
                      ? 'bg-primary text-white rounded-br-sm'
                      : 'bg-white border border-gray-200 text-gray-700 rounded-bl-sm'
                  }`}
                >
                  {t.content}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function AiReceptionist() {
  const { data: settings, loading: settingsLoading, refetch } = useSupabase(getAiSettings)
  const { data: sessions, loading: sessionsLoading } = useSupabase(
    useCallback(() => getAiSessions(), [])
  )

  if (settingsLoading) return <LoadingSpinner />

  return (
    <div>
      <PageHeader
        title="AI 안내원"
        description="대표번호로 걸려온 전화를 AI가 응대하고 방문예약을 유도합니다"
      />

      {!settings && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-700">
          AI 안내원 설정 행이 없습니다. Supabase에 <code>003_ai_receptionist.sql</code> 마이그레이션을 적용해 주세요.
        </div>
      )}

      <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <Bot size={16} /> 안내원 설정
      </h3>
      <SettingsForm settings={settings} onSaved={refetch} />

      <h3 className="text-sm font-semibold text-gray-700 mt-8 mb-1 flex items-center gap-2">
        <Sparkles size={16} /> 대화 시뮬레이터
      </h3>
      <p className="text-xs text-gray-400 mb-3">
        실제 전화와 동일한 AI로 미리 대화해 보세요. 설정을 바꾸면 <b>먼저 "설정 저장"</b> 후 "처음부터"를 누르면 반영됩니다.
      </p>
      <Simulator settings={settings} />

      <h3 className="text-sm font-semibold text-gray-700 mt-8 mb-3 flex items-center gap-2">
        <MessageSquare size={16} /> 최근 AI 통화 이력
      </h3>
      {sessionsLoading ? (
        <LoadingSpinner />
      ) : !sessions || sessions.length === 0 ? (
        <EmptyState message="AI 통화 이력이 없습니다." icon={MessageSquare} />
      ) : (
        <div className="space-y-2">
          {sessions.map(s => (
            <SessionRow key={s.id} session={s} />
          ))}
        </div>
      )}
    </div>
  )
}
