import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar, HamburgerButton } from './Sidebar';
import { ToastContainer } from './Toast';

export function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-page">
      {/* Sidebar */}
      <Sidebar
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100 shrink-0">
          <HamburgerButton onClick={() => setMobileOpen(true)} />
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-primary-600 rounded flex items-center justify-center">
              <span className="text-white text-[10px] font-bold">EE</span>
            </div>
            <span className="font-semibold text-gray-900 text-sm font-jakarta">Exam Engine</span>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-6 py-8">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Toast notifications */}
      <ToastContainer />
    </div>
  );
}
