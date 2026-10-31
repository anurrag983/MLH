import { Check, FileDiff, X } from "lucide-react"
import { Button } from "./ui"

export default function FixReviewDialog({ preview, onCancel, onConfirm, busy }) {
  if (!preview) return null
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/75 p-4 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-labelledby="fix-title" className="w-full max-w-3xl rounded-2xl border border-line bg-panel p-5 shadow-2xl md:p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-mint/10 p-2 text-mint"><FileDiff size={20} /></div>
          <div className="min-w-0 flex-1"><h2 id="fix-title" className="text-lg font-bold">Review this file change</h2><p className="mt-1 break-all mono text-[10px] text-slate-400">{preview.file}:{preview.line} · {preview.rule}</p></div>
          <button onClick={onCancel} aria-label="Close" className="text-slate-500 hover:text-white"><X size={18} /></button>
        </div>
        <p className="mt-4 rounded-lg border border-sky-400/15 bg-sky-400/[.04] p-3 text-sm leading-6 text-sky-100">{preview.explanation}</p>
        <pre className="mt-4 max-h-[50vh] overflow-auto rounded-lg border border-line bg-[#070a0d] p-4 mono text-[11px] leading-5 text-slate-200">{preview.diff}</pre>
        <p className="mt-3 text-[10px] text-slate-500">Saving applies this proposed change to your selected project. Secret values in removed lines are hidden. FreeBuff first makes a private backup and checks Python syntax.</p>
        <div className="mt-5 flex justify-end gap-2"><Button onClick={onCancel}>Cancel</Button><Button kind="primary" disabled={busy} onClick={onConfirm}><Check size={14} /> Save this change</Button></div>
      </section>
    </div>
  )
}
