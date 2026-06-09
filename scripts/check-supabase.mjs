/**
 * CALL-OS Supabase 연결 점검 스크립트
 *
 *   node scripts/check-supabase.mjs
 *
 * .env 파일의 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 를 읽어
 * 실제 Supabase 프로젝트에 연결되는지, 스키마/시드가 적용됐는지 확인한다.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// ── 의존성 없는 미니 .env 파서 ───────────────────────────
function loadEnv() {
  const env = { ...process.env }
  try {
    const raw = readFileSync(join(ROOT, '.env'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/)
      if (!m || line.trim().startsWith('#')) continue
      let val = m[2].trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      if (!(m[1] in env)) env[m[1]] = val
    }
  } catch {
    // .env 없으면 process.env 만 사용
  }
  return env
}

const c = {
  reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m',
  yellow: '\x1b[33m', cyan: '\x1b[36m', dim: '\x1b[2m',
}
const ok = (m) => console.log(`${c.green}✓${c.reset} ${m}`)
const warn = (m) => console.log(`${c.yellow}!${c.reset} ${m}`)
const fail = (m) => console.log(`${c.red}✗${c.reset} ${m}`)

const PLACEHOLDERS = ['your-project', 'your-anon-key', 'your-project.supabase.co']

async function main() {
  console.log(`${c.cyan}── CALL-OS Supabase 연결 점검 ──${c.reset}\n`)

  const env = loadEnv()
  const url = env.VITE_SUPABASE_URL
  const key = env.VITE_SUPABASE_ANON_KEY

  // 1) 환경변수 존재 / 플레이스홀더 확인
  if (!url || !key) {
    fail('.env 에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 없습니다.')
    console.log(`${c.dim}  → cp .env.example .env 후 값을 채우세요.${c.reset}`)
    process.exit(1)
  }
  if (PLACEHOLDERS.some((p) => url.includes(p) || key.includes(p))) {
    fail('아직 플레이스홀더 값입니다. 실제 Supabase URL/anon key 로 교체하세요.')
    console.log(`${c.dim}  URL: ${url}${c.reset}`)
    process.exit(1)
  }
  ok(`환경변수 로드됨 (${url})`)

  // 2) 연결 + 테이블별 카운트
  const supabase = createClient(url, key)
  const tables = ['teams', 'sales_agents', 'customers', 'call_logs', 'consult_logs']

  let allGood = true
  for (const t of tables) {
    const { count, error } = await supabase
      .from(t)
      .select('*', { count: 'exact', head: true })

    if (error) {
      allGood = false
      if (error.code === '42P01' || /does not exist/i.test(error.message)) {
        fail(`테이블 '${t}' 없음 → supabase/setup.sql 을 SQL Editor 에서 실행하세요.`)
      } else {
        fail(`'${t}' 조회 실패: ${error.message}`)
      }
    } else {
      ok(`${t.padEnd(13)} 접근 OK (행 ${count}개)`)
    }
  }

  console.log()
  if (allGood) {
    ok(`${c.green}연결 정상 — 앱을 띄워 테스트할 수 있습니다: npm run dev${c.reset}`)
    process.exit(0)
  } else {
    warn('일부 점검 실패 — 위 안내에 따라 조치 후 다시 실행하세요.')
    process.exit(1)
  }
}

main().catch((e) => {
  fail(`예기치 못한 오류: ${e.message}`)
  process.exit(1)
})
