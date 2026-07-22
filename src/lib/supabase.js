import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co'
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key'

export const supabase = createClient(supabaseUrl, supabaseKey)

// ──────────────────────────────────────────────
// Teams (팀/지점/부서)
// ──────────────────────────────────────────────
export async function getTeams() {
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function createTeam(team) {
  const { data, error } = await supabase
    .from('teams')
    .insert(team)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateTeam(id, updates) {
  const { data, error } = await supabase
    .from('teams')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteTeam(id) {
  const { error } = await supabase.from('teams').delete().eq('id', id)
  if (error) throw error
}

// ──────────────────────────────────────────────
// Sales Agents (영업사원)
// ──────────────────────────────────────────────
export async function getAgents(teamId) {
  let query = supabase
    .from('sales_agents')
    .select('*, teams(name)')
    .order('priority', { ascending: true })
  if (teamId) query = query.eq('team_id', teamId)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function createAgent(agent) {
  const { data, error } = await supabase
    .from('sales_agents')
    .insert(agent)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateAgent(id, updates) {
  const { data, error } = await supabase
    .from('sales_agents')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteAgent(id) {
  const { error } = await supabase.from('sales_agents').delete().eq('id', id)
  if (error) throw error
}

export async function updateAgentPriorities(agents) {
  const updates = agents.map((a, idx) =>
    supabase.from('sales_agents').update({ priority: idx + 1 }).eq('id', a.id)
  )
  await Promise.all(updates)
}

// ──────────────────────────────────────────────
// Customers
// ──────────────────────────────────────────────
export async function getCustomers(filters = {}) {
  let query = supabase
    .from('customers')
    .select('*, teams(name)')
    .order('created_at', { ascending: false })

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.team_id) query = query.eq('team_id', filters.team_id)
  if (filters.manager) query = query.ilike('manager', `%${filters.manager}%`)
  if (filters.search) {
    query = query.or(`name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%`)
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function getCustomerByPhone(phone) {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('phone', phone)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function createCustomer(customer) {
  const { data, error } = await supabase
    .from('customers')
    .insert(customer)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateCustomer(id, updates) {
  const { data, error } = await supabase
    .from('customers')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// ──────────────────────────────────────────────
// Call Logs
// ──────────────────────────────────────────────
export async function getCallLogs(filters = {}) {
  let query = supabase
    .from('call_logs')
    .select('*, teams(name), sales_agents(name)')
    .order('created_at', { ascending: false })

  if (filters.team_id) query = query.eq('team_id', filters.team_id)
  if (filters.call_status) query = query.eq('call_status', filters.call_status)
  if (filters.missed_only) query = query.eq('call_status', 'missed')
  if (filters.answered_by_agent_id) query = query.eq('answered_by_agent_id', filters.answered_by_agent_id)

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function createCallLog(log) {
  const { data, error } = await supabase
    .from('call_logs')
    .insert(log)
    .select()
    .single()
  if (error) throw error
  return data
}

// ──────────────────────────────────────────────
// Consult Logs
// ──────────────────────────────────────────────
export async function getConsultLogs(customerId) {
  let query = supabase
    .from('consult_logs')
    .select('*')
    .order('created_at', { ascending: false })

  if (customerId) query = query.eq('customer_id', customerId)

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function createConsultLog(log) {
  const { data, error } = await supabase
    .from('consult_logs')
    .insert(log)
    .select()
    .single()
  if (error) throw error
  return data
}

// ──────────────────────────────────────────────
// Reservations (방문예약)
// ──────────────────────────────────────────────
export async function getReservations(filters = {}) {
  let query = supabase
    .from('reservations')
    .select('*, teams(name)')
    .order('created_at', { ascending: false })

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.team_id) query = query.eq('team_id', filters.team_id)
  if (filters.search) {
    query = query.or(`customer_name.ilike.%${filters.search}%,customer_phone.ilike.%${filters.search}%`)
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function createReservation(reservation) {
  const { data, error } = await supabase
    .from('reservations')
    .insert(reservation)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateReservation(id, updates) {
  const { data, error } = await supabase
    .from('reservations')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteReservation(id) {
  const { error } = await supabase.from('reservations').delete().eq('id', id)
  if (error) throw error
}

// ──────────────────────────────────────────────
// AI 안내원 세션 / 설정
// ──────────────────────────────────────────────
export async function getAiSessions(filters = {}) {
  let query = supabase
    .from('ai_call_sessions')
    .select('*, teams(name)')
    .order('created_at', { ascending: false })

  if (filters.outcome) query = query.eq('outcome', filters.outcome)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function getAiSettings() {
  const { data, error } = await supabase
    .from('ai_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function updateAiSettings(updates) {
  const { data, error } = await supabase
    .from('ai_settings')
    .update(updates)
    .eq('id', 1)
    .select()
    .single()
  if (error) throw error
  return data
}

// ──────────────────────────────────────────────
// Dashboard Stats
// ──────────────────────────────────────────────
export async function getDashboardStats() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data: todayCalls, error: e1 } = await supabase
    .from('call_logs')
    .select('*')
    .gte('created_at', today.toISOString())

  if (e1) throw e1

  const total = todayCalls?.length || 0
  const answered = todayCalls?.filter(c => c.call_status === 'answered').length || 0
  const missed = todayCalls?.filter(c => c.call_status === 'missed').length || 0

  const byTeam = {}
  todayCalls?.forEach(c => {
    byTeam[c.team_id] = (byTeam[c.team_id] || 0) + 1
  })

  const byAgent = {}
  todayCalls?.filter(c => c.answered_by_agent_id).forEach(c => {
    byAgent[c.answered_by_agent_id] = (byAgent[c.answered_by_agent_id] || 0) + 1
  })

  // 방문예약 지표
  const { data: reservations } = await supabase
    .from('reservations')
    .select('status, created_at')

  const todayReservations = reservations?.filter(r => new Date(r.created_at) >= today).length || 0
  const pendingReservations = reservations?.filter(r => r.status === '요청').length || 0
  const confirmedReservations = reservations?.filter(r => r.status === '확정').length || 0

  return {
    total, answered, missed, byTeam, byAgent,
    todayReservations, pendingReservations, confirmedReservations,
  }
}
