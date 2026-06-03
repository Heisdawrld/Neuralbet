'use client';

import { UserButton, useUser } from '@clerk/nextjs';

function Placeholder() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-8 w-8 place-items-center rounded-full bg-slate-800 text-xs font-bold text-slate-400">C</div>
      <div className="min-w-0">
        <div className="truncate text-xs font-medium text-slate-300">My Account</div>
        <div className="text-[10px] text-slate-500">Free plan</div>
      </div>
    </div>
  );
}

export function SidebarUser() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return <Placeholder />;
  return <ClerkSidebarUser />;
}

function ClerkSidebarUser() {
  const { isLoaded, isSignedIn } = useUser();
  if (!isLoaded || !isSignedIn) return <Placeholder />;

  return (
    <div className="flex items-center gap-3">
      <UserButton afterSignOutUrl="/" />
      <div className="min-w-0">
        <div className="truncate text-xs font-medium text-slate-300">My Account</div>
        <div className="text-[10px] text-slate-500">Free plan</div>
      </div>
    </div>
  );
}
