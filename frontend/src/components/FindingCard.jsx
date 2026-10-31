import { AlertTriangle, FileCode2, ShieldAlert } from "lucide-react"
import { Button } from "./ui"

export default function FindingCard({ finding, busy, onReviewFix }) {
  const lines = Array.isArray(finding.code_context) ? finding.code_context : []
  const nextStep = finding.remediation || (finding.fixable
    ? "Review the suggested change, then save it only if it matches the application's expected behavior."
    : "Open the file at the line shown above, make the change described here, then scan the project again.")

  return (
    <article className="min-w-0 overflow-hidden rounded-xl border border-line bg-black/15">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 border-b border-line/70 p-4">
        <div className="flex min-w-0 gap-3">
          <div className="mt-0.5 shrink-0 text-rose-300">{finding.type === "secret" ? <ShieldAlert size={18} /> : <AlertTriangle size={18} />}</div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-sm text-slate-100">{finding.rule}</strong>
              <span className="rounded bg-rose-500/10 px-1.5 py-0.5 mono text-[9px] uppercase text-rose-300">{finding.severity} risk</span>
            </div>
            <div className="mt-1 break-all mono text-xs text-slate-300">{finding.file} · {finding.line ? `Line ${finding.line}` : "Line unavailable"}{finding.source === "git_diff" && " · Added in Git changes"}</div>
          </div>
        </div>
        {finding.fixable
          ? <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-slate-400">Preview first; saving needs your approval.</span><Button disabled={busy} onClick={() => onReviewFix(finding)}><FileCode2 size={14} />Review safe fix</Button></div>
          : <span className="rounded border border-amber-400/20 bg-amber-400/[.10] px-2.5 py-1.5 mono text-[10px] font-semibold text-amber-200">Manual step · no verified auto-fix</span>}
      </div>

      <div className="grid min-w-0 gap-4 p-4">
        <section className="min-w-0">
          <div className="mb-2 mono text-[10px] font-semibold uppercase tracking-wider text-slate-400">1 · Locate the issue · highlighted line is the finding</div>
          <div className="min-w-0 overflow-x-auto rounded-lg border border-line bg-[#070a0d] py-2">
            {lines.length ? lines.map((line) => <div key={line.line} className={`flex min-w-max px-3 mono text-[11px] leading-7 ${line.current ? "bg-rose-400/[.10] text-rose-100" : "text-slate-400"}`}>
              <span className={`w-10 shrink-0 select-none text-right ${line.current ? "text-rose-300" : "text-slate-500"}`}>{line.line}</span>
              <code className="ml-4 whitespace-pre">{line.text || " "}</code>
              {line.current && <span className="ml-4 text-[9px] font-bold uppercase tracking-wider text-rose-300">Finding</span>}
            </div>) : <div className="px-3 py-2 mono text-xs text-slate-400">{finding.source === "git_diff" ? "FreeBuff found a credential in Git changes but could not match it to a current source line. Open this file and search for the changed credential assignment." : "Source context is unavailable. Scan again to refresh this finding."}</div>}
          </div>
          {finding.type === "secret" && <p className="mt-2 text-[10px] text-slate-400">Secret values are hidden in this preview.</p>}
        </section>

        <div className="grid min-w-0 gap-3 md:grid-cols-2">
          <section className="min-w-0 rounded-lg border border-line bg-white/[.02] p-4">
            <div className="mono text-[10px] font-bold uppercase tracking-wider text-slate-300">2 · Why this matters</div>
            <p className="mt-2 text-sm leading-6 text-slate-300">{finding.detail}</p>
          </section>
          <section className="min-w-0 rounded-lg border border-mint/15 bg-mint/[.035] p-4">
            <div className="mono text-[10px] font-bold uppercase tracking-wider text-mint">3 · What to do next</div>
            <p className="mt-2 text-sm leading-6 text-slate-200">{nextStep}</p>
            {finding.fixable
              ? <p className="mt-3 text-xs leading-5 text-mint/90">FreeBuff can prepare a safe fix preview for this finding. Review the exact change before choosing Save.</p>
              : <p className="mt-3 text-xs leading-5 text-sky-200">FreeBuff has no verified automatic fix for this case. Follow the steps above, then run Scan again.</p>}
          </section>
        </div>
      </div>
    </article>
  )
}
