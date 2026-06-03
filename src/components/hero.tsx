import { ArrowRight, Brain, ShieldCheck, Zap } from 'lucide-react';
import { CipherLogo } from './logo';
import { AuthActions } from './auth/auth-actions';

export function Hero() {
  return (
    <main className="cipher-grid min-h-screen px-5 py-6">
      <nav className="mx-auto flex max-w-7xl items-center justify-between">
        <CipherLogo />
        <div className="hidden items-center gap-6 text-sm text-slate-400 md:flex">
          <a href="#model">Model</a>
          <a href="#pricing">Pricing</a>
          <a href="#fixtures">Fixtures</a>
        </div>
        <AuthActions />
      </nav>

      <section className="mx-auto grid max-w-7xl items-center gap-12 py-20 lg:grid-cols-[1.05fr_.95fr] lg:py-28">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-500/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-blue-200">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_18px_#10b981]" />
            Analyst-grade football intelligence
          </div>
          <h1 className="max-w-4xl text-5xl font-black leading-[0.95] tracking-tight text-white md:text-7xl lg:text-8xl">
            Decode the game before kickoff.
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-400 md:text-xl">
            Cipher understands football context — momentum, tactical matchups, rotation risk, managers, league pressure, player quality and market pricing — then tells you when to play safe, when to attack, and when to walk away.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <button className="group rounded-2xl bg-blue-500 px-6 py-4 font-bold text-white shadow-[0_0_36px_rgba(59,130,246,.35)] hover:bg-blue-400">
              Start free <ArrowRight className="ml-2 inline h-4 w-4 transition group-hover:translate-x-1" />
            </button>
            <button className="rounded-2xl border border-slate-700 bg-slate-900/50 px-6 py-4 font-bold text-slate-200 hover:border-blue-400/40">
              View today’s fixtures
            </button>
          </div>
        </div>

        <div className="glass rounded-[2rem] p-5">
          <div className="rounded-[1.5rem] border border-blue-400/20 bg-[#070a13]/90 p-5">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-blue-300">Cipher Report</p>
                <h2 className="mt-1 text-2xl font-black">Arsenal vs Liverpool</h2>
              </div>
              <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-300">STRONG</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ['Model Edge', '+7.8%', 'text-emerald-300'],
                ['Risk', 'Moderate', 'text-amber-300'],
                ['Confidence', '81%', 'text-blue-300'],
              ].map(([k, v, c]) => (
                <div key={k} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                  <div className="text-xs text-slate-500">{k}</div>
                  <div className={`mt-2 text-2xl font-black ${c}`}>{v}</div>
                </div>
              ))}
            </div>
            <div className="mt-5 space-y-3">
              {[
                ['Momentum', 'Liverpool enter with elite attacking rhythm, but defensive concessions are rising.'],
                ['Rotation Risk', 'Arsenal projected XI stable; Liverpool likely rotates one wide player after congested schedule.'],
                ['Tactical Read', 'Arsenal’s left overload attacks Liverpool’s weaker defensive transition channel.'],
              ].map(([k, v]) => (
                <div key={k} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="text-sm font-bold text-white">{k}</div>
                  <div className="mt-1 text-sm leading-6 text-slate-400">{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="model" className="mx-auto grid max-w-7xl gap-4 pb-16 md:grid-cols-3">
        {[
          [Brain, 'Reasons like an analyst', 'Context first: motivation, tactics, squad state and market psychology.'],
          [Zap, 'Attacks value only', 'Edge, CLV and Kelly-aware risk controls — no forced picks.'],
          [ShieldCheck, 'Learns from outcomes', 'Immutable pre-kickoff snapshots, calibration and per-league memory.'],
        ].map(([Icon, title, copy]) => {
          const I = Icon as typeof Brain;
          return <div key={String(title)} className="glass rounded-3xl p-6"><I className="mb-4 h-7 w-7 text-blue-300" /><h3 className="text-xl font-black">{String(title)}</h3><p className="mt-3 leading-7 text-slate-400">{String(copy)}</p></div>;
        })}
      </section>
    </main>
  );
}
