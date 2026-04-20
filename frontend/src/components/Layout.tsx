import { Outlet } from 'react-router-dom';
import { TopNav } from './TopNav';
import { ToastContainer } from './Toast';

export function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <TopNav />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1600px] w-full px-6 lg:px-8 pb-12 pt-6">
          <Outlet />
        </div>
      </main>
      <ToastContainer />
    </div>
  );
}
