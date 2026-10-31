import { Activity, CheckCircle2, Code2, KeyRound, ScanLine, ShieldAlert, ShieldCheck } from "lucide-react"
import { Button, Card } from "./ui"
import FindingCard from "./FindingCard"

export default function GuardPanel({ scan, selected, blocked, busy, onScan, onReviewFix }) {
  const findings = scan.findings || []
  return (
    <div className="space-y-4">
      <div className={`flex flex-wrap items-center justify-between gap-4 rounded-xl border p-5 ${blocked ? "border-rose-500/25 bg-rose-500/[.07]" : "border-emerald-500/25 bg-emerald-500/[.07]"}`}>
        <div className="flex items-center gap-4"><div className={`flex h-11 w-11 items-center justify-center rounded-xl ${!selected ? "bg-white/[.06] text-slate-400" : blocked ? "bg-rose-500/10 text-rose-300" : "bg-emerald-500/10 text-emerald-300"}`}>{!selected ? <ScanLine size={22} /> : blocked ? <ShieldAlert size={22} /> : <ShieldCheck size={22} />}</div><div><div className={`mono text-xs font-bold tracking-widest ${!selected ? "text-slate-300" : blocked ? "text-rose-300" : "text-emerald-300"}`}>{scan.status}</div><div className="mt-1 text-[11px] text-slate-400">{selected ? <>Heuristic score <b className="text-slate-200">{scan.score}/100</b> · {findings.length} finding(s)</> : "Choose your project folder to start."}</div></div></div>
        <Button disabled={busy} onClick={onScan}><ScanLine size={14} /> Scan project</Button>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
        <Card eyebrow="SECRET CHECKS" title="Credential findings">
          {!selected ? <div className="py-10 text-center text-xs text-slate-500">Choose a project folder first.</div> : findings.filter((f) => f.type === "secret").length ? <div className="space-y-3">{findings.filter((f) => f.type === "secret").map((finding, index) => <FindingCard key={`${finding.file}-${finding.line}-${index}`} finding={finding} busy={busy} onReviewFix={onReviewFix} />)}</div> : <div className="py-10 text-center text-xs text-slate-500"><CheckCircle2 className="mx-auto mb-2 text-emerald-400" size={24} />No common hardcoded credential patterns found.</div>}
        </Card>
        <Card eyebrow="CHECK COVERAGE" title="What these checks mean">
          <div className="space-y-3">{(scan.audits || []).map((audit, index) => <div key={audit.category} className="flex items-start gap-3 rounded-lg border border-line bg-black/15 p-3"><div className={`mt-0.5 ${audit.status === "No findings" ? "text-emerald-300" : "text-sky-300"}`}>{index === 0 ? <KeyRound size={15} /> : index === 1 ? <Code2 size={15} /> : <Activity size={15} />}</div><div className="flex-1"><div className="flex justify-between gap-2"><strong className="text-xs">{audit.category}</strong><span className="mono text-[9px] text-slate-400">{audit.status}</span></div><p className="mt-1 text-[10px] leading-5 text-slate-500">{audit.detail}</p></div></div>)}</div>
          <div className="mt-4 rounded-lg border border-sky-400/15 bg-sky-400/[.035] p-3 text-xs leading-5 text-sky-100">Readiness is a simple local score. A clean score does not certify the project or guarantee that it is safe to ship.</div>
        </Card>
      </div>
    </div>
  )
}
