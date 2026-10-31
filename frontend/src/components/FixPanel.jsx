import { ArrowRight, CheckCircle2, FileDiff } from "lucide-react"
import { Button, Card } from "./ui"
import FindingCard from "./FindingCard"

export default function FixPanel({ scan, selected, busy, lastFix, onScan, onReviewFix, onContinue, continueDisabled = false }) {
  const findings = scan.findings || []
  return (
    <div className="space-y-4">
      {lastFix?.saved && <div role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/[.05] p-4 text-xs text-emerald-200"><CheckCircle2 className="mr-2 inline" size={15} />Saved {lastFix.file}. A private backup was created in <code>~/.local/share/freebuf/backups</code>.<p className="mt-2 leading-5 text-emerald-100/70">{lastFix.explanation}</p></div>}

      <Card eyebrow="CODE FINDINGS" title="Findings and safe fixes" action={<Button disabled={busy} onClick={onScan}><FileDiff size={13} /> Scan again</Button>}>
        {!selected ? <div className="rounded-lg border border-line bg-black/15 p-5 text-center text-xs text-slate-400">Choose a project folder above, then select <b className="text-slate-200">Scan project</b>.</div> : findings.length ? <div className="space-y-3">
          {findings.map((finding, index) => <FindingCard key={`${finding.file}:${finding.line}:${finding.rule}:${index}`} finding={finding} busy={busy} onReviewFix={onReviewFix} />)}
        </div> : <div className="py-10 text-center text-xs text-slate-500"><CheckCircle2 className="mx-auto mb-2 text-emerald-400" size={25} />No findings from FreeBuff's current checks. This is not a full security audit.</div>}
        <div className="mt-4 text-[10px] text-slate-600">Scanned {scan.files_scanned || 0} readable project files (up to 1 MB each). FreeBuff does not execute your application.</div>
        {onContinue && selected && <div className="mt-5 flex flex-col gap-4 rounded-xl border border-mint/20 bg-mint/[.045] p-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-sm font-bold text-white">Done reviewing this step?</h3><p className="mt-1 max-w-xl text-xs leading-5 text-slate-300">You can move on after reviewing the results. High-risk items must be fixed in the project and scanned again before FreeBuff allows a commit.</p>{continueDisabled && <p className="mt-2 text-xs font-semibold text-rose-200">Resolve high-risk findings first, then scan the project again.</p>}</div><Button kind="primary" disabled={continueDisabled} onClick={onContinue} className="shrink-0 !px-4 !py-3 !text-sm">I reviewed these results<ArrowRight size={16} /></Button></div>}
      </Card>
    </div>
  )
}
