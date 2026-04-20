import { useState } from 'react'
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

export function TopNav() {
  const navigate = useNavigate()
  const { t } = useLang()
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleLogout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    navigate('/login')
  }

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-[15px] font-medium transition-colors ${
      isActive
        ? 'bg-white/15 text-white'
        : 'text-white/75 hover:text-white hover:bg-white/10'
    }`

  const mobileLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${
      isActive
        ? 'bg-white/15 text-white'
        : 'text-white/80 hover:text-white hover:bg-white/10'
    }`

  return (
    <header
      className="sticky top-0 z-40 w-full text-white"
      style={{ backgroundColor: '#1A1A1A' }}
    >
      <div className="mx-auto max-w-[1600px] flex items-center h-[72px] px-6 lg:px-8 gap-5">
        {/* Brand */}
        <div className="flex items-center gap-3 shrink-0">
          <img src="/iku-logo.svg" alt="İKÜ" className="w-10 h-10 object-contain" />
          <span className="hidden sm:inline text-lg font-bold tracking-tight">
            Exam Engine
          </span>
        </div>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1 flex-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={navLinkClass}
            >
              <span className="material-symbols-outlined text-xl">{item.icon}</span>
              <span>{t(item.labelKey)}</span>
            </NavLink>
          ))}
        </nav>

        {/* Spacer for mobile */}
        <div className="flex-1 md:hidden" />

        {/* Right cluster */}
        <div className="flex items-center gap-2 shrink-0">
          <LangToggle variant="dark" />

          <button
            className="hidden sm:inline-flex p-2.5 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title={t('nav.notifications')}
            aria-label={t('nav.notifications')}
          >
            <span className="material-symbols-outlined text-[22px]">notifications</span>
          </button>

          <button
            className="hidden sm:inline-flex p-2.5 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title={t('nav.settings')}
            aria-label={t('nav.settings')}
          >
            <span className="material-symbols-outlined text-[22px]">settings</span>
          </button>

          <div className="hidden lg:flex items-center gap-3 pl-3 ml-1 border-l border-white/15">
            <div className="w-9 h-9 rounded-full bg-iku-red flex items-center justify-center text-xs font-bold text-white">
              DA
            </div>
            <span className="text-sm font-semibold text-white/90">Dr. Admin</span>
          </div>

          <button
            onClick={handleLogout}
            className="p-2.5 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title={t('nav.logout')}
            aria-label={t('nav.logout')}
          >
            <span className="material-symbols-outlined text-[22px]">logout</span>
          </button>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="md:hidden p-2.5 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Menu"
            aria-expanded={mobileOpen}
          >
            <span className="material-symbols-outlined text-[22px]">
              {mobileOpen ? 'close' : 'menu'}
            </span>
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div
          className="md:hidden border-t border-white/10"
          style={{ backgroundColor: '#1A1A1A' }}
        >
          <nav className="flex flex-col py-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={mobileLinkClass}
                onClick={() => setMobileOpen(false)}
              >
                <span className="material-symbols-outlined text-xl">{item.icon}</span>
                <span>{t(item.labelKey)}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      )}
    </header>
  )
}
