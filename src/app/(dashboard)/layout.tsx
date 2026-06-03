import { MobileNav } from '@/components/dashboard/mobile-nav';
import { Sidebar } from '@/components/dashboard/sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="min-h-screen pb-24 md:pb-0 md:pl-64">
        {children}
      </div>
      <MobileNav />
    </div>
  );
}
