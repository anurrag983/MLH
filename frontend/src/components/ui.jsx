export function Button({ children, onClick, kind = "muted", disabled = false, className = "", title }) {
  const styles = {
    primary: "bg-mint text-[#06110b] hover:bg-[#9cffc7] shadow-glow",
    muted: "border border-line bg-white/[.035] text-slate-200 hover:border-slate-500 hover:bg-white/[.07]",
    danger: "border border-rose-500/25 bg-rose-500/10 text-rose-200 hover:bg-rose-500/15",
  }
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[kind]} ${className}`}
    >
      {children}
    </button>
  )
}

export function Card({ children, className = "", title, eyebrow, action }) {
  return (
    <section className={`rounded-xl border border-line bg-panel/90 ${className}`}>
      <div className="flex items-center justify-between border-b border-line/80 px-5 py-4">
        <div>
          {eyebrow && (
            <div className="mono mb-1 text-[9px] uppercase tracking-[.2em] text-mint/70">
              {eyebrow}
            </div>
          )}
          <h2 className="text-sm font-bold text-slate-100">{title}</h2>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

export function Metric({ icon: Icon, label, value, tone }) {
  const tint = {
    rose: "text-rose-300 bg-rose-400/10",
    green: "text-emerald-300 bg-emerald-400/10",
    mint: "text-mint bg-mint/10",
    slate: "text-slate-300 bg-white/[.06]",
  }[tone]
  return (
    <div className="rounded-xl border border-line bg-panel/80 p-4">
      <div className="flex items-start justify-between">
        <div className="text-[9px] uppercase tracking-wider text-slate-600">{label}</div>
        <div className={`rounded-lg p-2 ${tint}`}><Icon size={14} /></div>
      </div>
      <div className="mt-2 truncate mono text-xs font-medium text-slate-200">{value}</div>
    </div>
  )
}

export function MarkdownPreview({ text = "" }) {
  const safeText = typeof text === "string" ? text : ""
  return (
    <div className="space-y-5">
      {safeText.split("\n\n").filter(Boolean).map((block, index) => {
        const lines = block.split("\n")
        const heading = lines[0].startsWith("### ") ? lines[0].slice(4) : null
        const items = heading ? lines.slice(1) : lines
        return (
          <div key={`${heading || "section"}-${index}`}>
            {heading && <h3 className="mb-2 border-b border-line pb-2 text-xs font-bold text-mint">{heading}</h3>}
            <ul className="space-y-2">
              {items.map((line, lineIndex) => (
                <li key={lineIndex} className="flex gap-2 text-[11px] leading-5 text-slate-400">
                  <span className="text-mint">•</span>{line.replace(/^-\s*/, "")}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
