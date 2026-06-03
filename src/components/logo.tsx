export function CipherLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="prism relative grid h-10 w-10 place-items-center rounded-xl border border-blue-400/30 bg-blue-500/10">
        <div className="h-5 w-5 rotate-45 rounded-[3px] border border-blue-300 bg-blue-400/20" />
        <div className="absolute h-2 w-2 rotate-45 bg-blue-300" />
      </div>
      {!compact && (
        <div>
          <div className="text-lg font-black tracking-[0.22em]">CIPHER</div>
          <div className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Decode football</div>
        </div>
      )}
    </div>
  );
}
