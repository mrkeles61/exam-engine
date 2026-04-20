import { NavLink, useNavigate } from 'react-router-dom'
import { useLang, type TranslationKey } from '../i18n'
import { LangToggle } from './LangToggle'

interface NavItem {
  to: string
  labelKey: TranslationKey
  icon: string
  end?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/',              labelKey: 'nav.dashboard',    icon: 'dashboard',        end: true },
  { to: '/upload',        labelKey: 'nav.uploadExam',   icon: 'cloud_upload' },
  { to: '/exam-builder',  labelKey: 'nav.examBuilder',  icon: 'assignment_add' },
  { to: '/jobs',          labelKey: 'nav.evaluations',  icon: 'assignment' },
  { to: '/answer-keys',   labelKey: 'nav.answerKeys',   icon: 'key' },
  { to: '/analytics',     labelKey: 'nav.analytics',    icon: 'analytics' },
]

interface SidebarProps {
  mobileOpen: boolean
  onMobileClose: () => void
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const navigate = useNavigate()
  const { t } = useLang()

  const handleLogout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    navigate('/login')
  }

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-150 ${
      isActive
        ? 'bg-iku-red/15 text-white font-semibold border-l-2 border-iku-red'
        : 'text-white/70 hover:text-white hover:bg-white/10'
    }`

  const SidebarContent = () => (
    <div className="flex flex-col h-full p-4">
      {/* Logo */}
      <div className="flex items-center justify-between mb-8 px-2">
        <div className="flex items-center gap-2">
          <img src="/iku-logo.svg" alt="İKÜ" className="w-8 h-8 object-contain" />
          <span className="text-lg font-bold tracking-tighter text-white">Exam Engine</span>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
          <span className="material-symbols-outlined text-white/40 text-sm">search</span>
        </div>
        <div className="w-full bg-white/10 rounded-lg px-9 py-2 text-sm text-white/60 flex items-center justify-between cursor-pointer hover:bg-white/15 transition-colors">
          <span>{t('nav.search')}</span>
          <span className="text-[10px] opacity-40">&#8984;K</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={navLinkClass}
            onClick={onMobileClose}
          >
            <span className="material-symbols-outlined text-xl">{item.icon}</span>
            <span>{t(item.labelKey)}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer: lang toggle + user + logout */}
      <div className="mt-auto pt-6 border-t border-white/5 space-y-4">
        <div className="px-2">
          <LangToggle variant="dark" />
        </div>
        <div className="flex items-center gap-3 px-2">
          <div className="w-10 h-10 rounded-full bg-iku-red flex items-center justify-center text-sm font-bold text-white">
            DA
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">Dr. Admin</p>
            <p className="text-[10px] text-white/60 truncate">admin@university.edu</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-white/40 hover:text-white transition-colors"
            title={t('nav.logout')}
          >
            <span className="material-symbols-outlined text-xl">logout</span>
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      <aside
        className="hidden lg:flex flex-col w-[240px] shrink-0 h-screen sticky top-0 z-50"
        style={{ background: 'linear-gradient(180deg, #1A1A1A 0%, #2A2A2A 100%)' }}
      >
        <SidebarContent />
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          onClick={onMobileClose}
        >
          <div className="absolute inset-0 bg-black/60" />
        </div>
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[240px] flex flex-col lg:hidden
                    transition-transform duration-300 ease-in-out
                    ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ background: 'linear-gradient(180deg, #1A1A1A 0%, #2A2A2A 100%)' }}
      >
        <SidebarContent />
      </aside>
    </>
  )
}

export function HamburgerButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="lg:hidden p-2 rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors"
      aria-label="Open menu"
    >
      <span className="material-symbols-outlined">menu</span>
    </button>
  )
}
