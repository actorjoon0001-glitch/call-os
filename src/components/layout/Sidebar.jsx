import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Building2,
  Users,
  UserCircle,
  Phone,
  MessageSquare,
  Settings,
  PhoneCall,
  Menu,
  X,
} from 'lucide-react'
import { useState } from 'react'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '대시보드' },
  { to: '/showrooms', icon: Building2, label: '전시장 관리' },
  { to: '/agents', icon: Users, label: '영업팀원 관리' },
  { to: '/customers', icon: UserCircle, label: '고객 관리' },
  { to: '/call-logs', icon: Phone, label: '통화 로그' },
  { to: '/consult-logs', icon: MessageSquare, label: '상담 이력' },
]

export default function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {/* Mobile toggle */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 bg-sidebar text-white p-2 rounded-lg"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 z-40 h-screen w-64 bg-sidebar text-white
          flex flex-col transition-transform duration-200
          lg:translate-x-0
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-700">
          <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
            <PhoneCall size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">CALL-OS</h1>
            <p className="text-xs text-gray-400">고객전화 분배 시스템</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary text-white'
                    : 'text-gray-300 hover:bg-sidebar-hover hover:text-white'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700">
          <p className="text-xs text-gray-500">CALL-OS v1.0 MVP</p>
          <p className="text-xs text-gray-500">세움건설 전화분배 시스템</p>
        </div>
      </aside>
    </>
  )
}
