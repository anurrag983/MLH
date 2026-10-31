import { Check, LockKeyhole } from "lucide-react"

function ProgressRing({ value }) {
  const radius = 28
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - value / 100)
  return (
    <div className="relative grid h-[76px] w-[76px] shrink-0 place-items-center" role="img" aria-label={`${value}% of workflow complete`}>
      <svg viewBox="0 0 76 76" className="absolute inset-0 -rotate-90">
        <circle cx="38" cy="38" r={radius} fill="none" stroke="rgba(255,255,255,.09)" strokeWidth="6" />
        <circle cx="38" cy="38" r={radius} fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} className="text-mint transition-all duration-700" />
      </svg>
      <div className="text-center"><div className="mono text-base font-black text-white">{value}%</div><div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">done</div></div>
    </div>
  )
}

export default function WorkflowStepper({ steps, current, active = current, completed, onSelect, projectName }) {
  const percent = Math.round((completed.filter(Boolean).length / steps.length) * 100)
  return (
    <aside className="h-fit lg:min-h-0">
      <section className="overflow-hidden rounded-2xl border border-line bg-panel/95 shadow-xl shadow-black/10 lg:flex lg:h-full lg:flex-col">
        <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3">
          <ProgressRing value={percent} />
          <div className="min-w-0"><div className="mono text-[10px] font-bold uppercase tracking-[.16em] text-mint">Your project path</div><h2 className="mt-0.5 text-sm font-extrabold text-white">One step at a time</h2><p className="mt-0.5 truncate text-xs text-slate-400">{projectName || "Choose a project to begin"}</p></div>
        </div>
        <nav aria-label="Project workflow steps" className="grid gap-2 p-3 lg:min-h-0 lg:flex-1 lg:content-center">
          {steps.map((step, index) => {
            const Icon = step.icon
            const done = completed[index]
            const locked = index > current && !done
            const isActive = index === active
            return (
              <button key={step.id} type="button" onClick={() => !locked && onSelect(index)} disabled={locked} aria-current={isActive ? "step" : undefined} className={`group relative flex w-full items-start gap-3 rounded-xl p-3 text-left transition ${isActive ? "border border-mint/30 bg-mint/[.08] shadow-[inset_0_0_0_1px_rgba(118,247,178,.04)]" : done ? "border border-transparent hover:bg-white/[.04]" : "border border-transparent"}`}>
                {index < steps.length - 1 && <span aria-hidden="true" className={`absolute left-[25px] top-[44px] h-[calc(100%-16px)] w-px ${done ? "bg-mint/45" : "bg-white/10"}`} />}
                <span className={`relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border transition ${done ? "border-mint/40 bg-mint text-[#07120c]" : isActive ? "border-mint bg-[#0b1510] text-mint shadow-glow" : "border-white/15 bg-white/[.035] text-slate-400"}`}>
                  {done ? <Check size={16} strokeWidth={3} /> : locked ? <LockKeyhole size={13} /> : <Icon size={15} />}
                </span>
                <span className="min-w-0 flex-1 pb-1">
                  <span className={`block text-[13px] font-bold ${isActive ? "text-white" : done ? "text-slate-200" : "text-slate-400"}`}>{step.title}</span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-slate-400">{done ? "Complete" : isActive ? step.description : "Finish the step above first"}</span>
                </span>
                {isActive && <span className="mt-1 rounded-full bg-mint/15 px-2 py-1 mono text-[9px] font-bold uppercase tracking-wider text-mint">Now</span>}
              </button>
            )
          })}
        </nav>
        <div className="hidden shrink-0 border-t border-line px-3 py-3 lg:block">
          <div className="flex items-start gap-2 rounded-lg border border-sky-300/15 bg-sky-300/[.045] p-2.5"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sky-300/10 text-xs text-sky-200">i</span><p className="text-[11px] leading-4 text-slate-300">Checks stay local. Push only when you choose.</p></div>
        </div>
      </section>
    </aside>
  )
}
