import { useEffect, useState } from 'react'
import { Settings as SettingsIcon, Phone, MessageSquare, Sliders, Save } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import Badge from '../components/ui/Badge'
import { getCompanySettings, updateCompanySettings, getTeams } from '../lib/supabase'

const PROVIDERS = [
  { value: 'twilio', label: 'Twilio (개발/시연)' },
  { value: 'sejong', label: '세종텔레콤 (예정)' },
  { value: 'kt', label: 'KT 비즈콜 (예정)' },
  { value: 'lguplus', label: 'LG U+ (예정)' },
]

export default function Settings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [form, setForm] = useState(null)
  const [teams, setTeams] = useState([])

  useEffect(() => {
    async function load() {
      try {
        const [s, t] = await Promise.all([getCompanySettings(), getTeams()])
        setForm(s || defaultForm())
        setTeams(t || [])
      } catch (e) {
        console.error(e)
        alert('설정을 불러오지 못했습니다: ' + e.message)
        setForm(defaultForm())
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        company_name: form.company_name?.trim() || '우리회사',
        main_phone: normalizePhone(form.main_phone),
        ars_greeting: form.ars_greeting?.trim() || null,
        ars_after_menu_message: form.ars_after_menu_message?.trim() || null,
        ars_no_agent_message: form.ars_no_agent_message?.trim() || null,
        ars_invalid_input_message: form.ars_invalid_input_message?.trim() || null,
        ring_timeout_seconds: clampInt(form.ring_timeout_seconds, 5, 60, 15),
        max_sequential_attempts: clampInt(form.max_sequential_attempts, 1, 30, 10),
        enable_broadcast_fallback: !!form.enable_broadcast_fallback,
        telephony_provider: form.telephony_provider || 'twilio',
      }
      const updated = await updateCompanySettings(payload)
      setForm(updated)
      setSavedAt(new Date())
    } catch (err) {
      alert('저장 실패: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading || !form) return <LoadingSpinner />

  const activeTeams = teams.filter(t => t.is_active)
  const arsPreview = buildArsPreview(form, activeTeams)

  return (
    <div>
      <PageHeader
        title="회사·대표번호 설정"
        description="대표번호 통합 운영을 위한 회사 단위 설정"
        actions={
          savedAt && (
            <Badge variant="success">
              저장됨 · {savedAt.toLocaleTimeString('ko-KR')}
            </Badge>
          )
        }
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 1) 회사 기본 정보 */}
        <Section icon={Phone} title="기본 정보" desc="ARS 안내멘트 및 발신자 ID에 사용됩니다">
          <Field label="회사명" required>
            <input
              type="text"
              required
              value={form.company_name || ''}
              onChange={e => setForm({ ...form, company_name: e.target.value })}
              className={inputCls}
              placeholder="예: 우리회사 주식회사"
            />
          </Field>
          <Field
            label="대표번호"
            hint="E.164 형식 권장 (예: +821512345678). 인바운드 수신 + 발신 callerId로 사용"
          >
            <input
              type="text"
              value={form.main_phone || ''}
              onChange={e => setForm({ ...form, main_phone: e.target.value })}
              className={inputCls}
              placeholder="예: +821512345678 또는 1500-1234"
            />
          </Field>
          <Field label="통신사 어댑터">
            <select
              value={form.telephony_provider || 'twilio'}
              onChange={e => setForm({ ...form, telephony_provider: e.target.value })}
              className={inputCls}
            >
              {PROVIDERS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </Field>
        </Section>

        {/* 2) ARS 멘트 */}
        <Section
          icon={MessageSquare}
          title="ARS 안내멘트"
          desc="비워두면 팀 목록을 기반으로 자동 생성됩니다"
        >
          <Field
            label="ARS 인사말"
            hint="비워두면 '안녕하세요, {회사명}입니다. 원하시는 메뉴 번호를 눌러주세요.' + 활성 팀 목록 자동 생성"
          >
            <textarea
              rows={3}
              value={form.ars_greeting || ''}
              onChange={e => setForm({ ...form, ars_greeting: e.target.value })}
              className={inputCls}
              placeholder="(자동 생성)"
            />
          </Field>
          <Field label="메뉴 선택 후 안내">
            <input
              type="text"
              value={form.ars_after_menu_message || ''}
              onChange={e => setForm({ ...form, ars_after_menu_message: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="담당자 없음 안내">
            <input
              type="text"
              value={form.ars_no_agent_message || ''}
              onChange={e => setForm({ ...form, ars_no_agent_message: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="잘못된 입력 안내">
            <input
              type="text"
              value={form.ars_invalid_input_message || ''}
              onChange={e => setForm({ ...form, ars_invalid_input_message: e.target.value })}
              className={inputCls}
            />
          </Field>

          {/* 미리보기 */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mt-2">
            <p className="text-xs text-gray-500 mb-1">실제 재생되는 인사말 미리보기</p>
            <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans">
              {arsPreview || '활성 팀이 없습니다. 팀 관리에서 팀을 활성화하세요.'}
            </pre>
          </div>
        </Section>

        {/* 3) 라우팅 동작 */}
        <Section icon={Sliders} title="콜 라우팅 동작">
          <Field
            label="벨 울림 타임아웃"
            hint="담당자 1인당 응답 대기 시간 (5~60초)"
          >
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={5}
                max={60}
                value={form.ring_timeout_seconds ?? 15}
                onChange={e =>
                  setForm({ ...form, ring_timeout_seconds: Number(e.target.value) })
                }
                className={`${inputCls} w-24`}
              />
              <span className="text-sm text-gray-500">초</span>
            </div>
          </Field>
          <Field
            label="순차 연결 최대 시도 인원"
            hint="이 인원수까지 1명씩 순차 연결 후, 미응답이면 다음 단계로"
          >
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={30}
                value={form.max_sequential_attempts ?? 10}
                onChange={e =>
                  setForm({ ...form, max_sequential_attempts: Number(e.target.value) })
                }
                className={`${inputCls} w-24`}
              />
              <span className="text-sm text-gray-500">명</span>
            </div>
          </Field>
          <Field
            label="동시 울림 폴백"
            hint="순차 시도 모두 실패 시 팀 전체에게 동시 울림"
          >
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!form.enable_broadcast_fallback}
                onChange={e =>
                  setForm({ ...form, enable_broadcast_fallback: e.target.checked })
                }
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">
                {form.enable_broadcast_fallback ? '사용' : '미사용'}
              </span>
            </label>
          </Field>
        </Section>

        <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-5 py-4">
          <p className="text-xs text-gray-500">
            마지막 수정: {form.updated_at
              ? new Date(form.updated_at).toLocaleString('ko-KR')
              : '없음'}
          </p>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 text-sm font-medium"
          >
            <Save size={16} />
            {saving ? '저장 중...' : '설정 저장'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ──────────────────────────────────────────────
// Sub components
// ──────────────────────────────────────────────
function Section({ icon: Icon, title, desc, children }) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start gap-3 mb-4 pb-3 border-b border-gray-100">
        <div className="w-8 h-8 bg-primary/10 text-primary rounded-lg flex items-center justify-center shrink-0">
          <Icon size={16} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {desc && <p className="text-xs text-gray-500 mt-0.5">{desc}</p>}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function Field({ label, required, hint, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  )
}

const inputCls =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none'

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function defaultForm() {
  return {
    company_name: '우리회사',
    main_phone: '',
    ars_greeting: '',
    ars_after_menu_message: '잠시만 기다려 주세요. 담당자를 연결해 드리겠습니다.',
    ars_no_agent_message: '현재 상담 가능한 직원이 없습니다. 잠시 후 다시 이용해 주세요.',
    ars_invalid_input_message: '잘못된 입력입니다. 다시 시도해 주세요.',
    ring_timeout_seconds: 15,
    max_sequential_attempts: 10,
    enable_broadcast_fallback: true,
    telephony_provider: 'twilio',
  }
}

function clampInt(v, min, max, fallback) {
  const n = parseInt(v, 10)
  if (Number.isNaN(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function normalizePhone(p) {
  if (!p) return null
  const trimmed = String(p).trim()
  return trimmed || null
}

function buildArsPreview(form, activeTeams) {
  if (form.ars_greeting && form.ars_greeting.trim()) return form.ars_greeting.trim()
  if (!activeTeams || activeTeams.length === 0) return ''
  const lines = [
    `안녕하세요, ${form.company_name || '우리회사'}입니다.`,
    '원하시는 메뉴 번호를 눌러주세요.',
  ]
  activeTeams.forEach((t, i) => lines.push(`${i + 1}번 ${t.name},`))
  return lines.join('\n')
}
