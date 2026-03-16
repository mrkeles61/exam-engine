import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

interface NavItem {
  to: string;
  label: string;
  icon: JSX.Element;
  end?: boolean;
}

function HomeIcon() {
  return (
    <svg className="w-4.5 h-4.5 shrink-0" style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  );
}

const NAV_ITEMS: NavItem[] = [
  { to: '/',              label: 'Pano',               icon: <HomeIcon />,     end: true },
  { to: '/upload',        label: 'Sınav Yükle',        icon: <UploadIcon /> },
  { to: '/jobs',          label: 'Değerlendirmeler',   icon: <ClipboardIcon /> },
  { to: '/answer-keys',   label: 'Cevap Anahtarları',  icon: <KeyIcon /> },
];

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    navigate('/login');
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `nav-item ${isActive ? 'nav-item-active' : ''}`;

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold font-jakarta">EE</span>
          </div>
          <div>
            <p className="text-white font-bold text-sm font-jakarta leading-tight">Exam Engine</p>
            <p className="text-indigo-300 text-xs leading-tight">Sınav Değerlendirme</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <p className="px-3 mb-2 text-[10px] font-semibold text-indigo-400 uppercase tracking-widest">
          Menü
        </p>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={navLinkClass}
            onClick={onMobileClose}
          >
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-white/10">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm
                     font-medium text-indigo-300 hover:text-white hover:bg-white/10
                     transition-all duration-150"
        >
          <LogoutIcon />
          <span>Çıkış Yap</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="hidden lg:flex flex-col w-[260px] shrink-0 h-screen sticky top-0
                   bg-navy"
        style={{ background: 'linear-gradient(180deg, #1E1B4B 0%, #16134A 100%)' }}
      >
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          onClick={onMobileClose}
        >
          <div className="absolute inset-0 bg-black/60" />
        </div>
      )}

      {/* Mobile drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[260px] flex flex-col lg:hidden
                    transition-transform duration-300 ease-in-out
                    ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ background: 'linear-gradient(180deg, #1E1B4B 0%, #16134A 100%)' }}
      >
        <SidebarContent />
      </aside>
    </>
  );
}

/* Hamburger button for mobile */
export function HamburgerButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="lg:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
      aria-label="Menüyü aç"
    >
      <svg style={{ width: 20, height: 20 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
  );
}
