/**
 * FullScreenLayout — protected-route wrapper that shares the same TopNav
 * as the main Layout but renders the page content edge-to-edge (no
 * centered max-width container, no extra padding). Used by the
 * Consolidated Workspace (V4) and the Exam Builder, which manage their
 * own internal sub-strips and column grids.
 */
import { Outlet } from 'react-router-dom'
import { TopNav } from './TopNav'
import { ToastContainer } from './Toast'

export function FullScreenLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-on-surface">
      <TopNav />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <ToastContainer />
    </div>
  )
}
