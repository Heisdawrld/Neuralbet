import Link from 'next/link';
import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  const hasClerk = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  return (
    <div className="cipher-grid flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-8">
        <div className="flex items-center gap-3">
          <div className="prism relative grid h-10 w-10 place-items-center rounded-xl border border-blue-400/30 bg-blue-500/10">
            <div className="h-5 w-5 rotate-45 rounded-[3px] border border-blue-300 bg-blue-400/20" />
            <div className="absolute h-2 w-2 rotate-45 bg-blue-300" />
          </div>
          <div>
            <div className="text-lg font-black tracking-[0.22em]">CIPHER</div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Decode football</div>
          </div>
        </div>
        {hasClerk ? <SignUp /> : (
          <div className="glass rounded-2xl p-8 text-center">
            <p className="text-slate-300">Clerk is not configured in this environment.</p>
            <Link href="/dashboard" className="mt-4 inline-block rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-bold text-white">Open dev dashboard</Link>
          </div>
        )}
      </div>
    </div>
  );
}
