import { useState } from "react"
import { ArrowLeft, ArrowRight, Check, CloudUpload, FileCode2, FolderOpen, GitBranch, GitCommitHorizontal, GitPullRequest, Github, LoaderCircle, ScanLine, ShieldCheck, Sparkles, Terminal, X } from "lucide-react"
import { Button } from "./ui"

const totalSteps = 5

function Meter({ step }) {
  return <div className="mt-5 flex items-center gap-2" aria-label={`Tutorial step ${step + 1} of ${totalSteps}`}>
    {Array.from({ length: totalSteps }, (_, index) => <div key={index} className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${index <= step ? "bg-mint shadow-glow" : "bg-white/[.08]"}`} />)}
  </div>
}

export default function GettingStartedDialog({ onClose, onChooseFolder, onScan, onOpenFindings, onOpenGit, workspaceSelected, workspaceName, findingsCount }) {
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")

  const chooseProject = async () => {
    setBusy(true)
    setMessage("")
    try {
      const selected = await onChooseFolder()
      if (selected) { setStep(2); setMessage("Nice! Your project is ready for its first scan.") }
      else setMessage("No folder selected yet. You can try again or continue later.")
    } catch (error) { setMessage(error.message || "Could not open the folder picker.") }
    finally { setBusy(false) }
  }

  const runFirstScan = async () => {
    setBusy(true)
    setMessage("")
    try {
      const result = await onScan()
      if (result) {
        const count = result.scan?.findings?.length ?? findingsCount ?? 0
        setMessage(count ? `Scan complete! FreeBuff found ${count} item${count === 1 ? "" : "s"} to review.` : "Scan complete! No supported findings were detected.")
        setStep(3)
      } else setMessage("Choose a project folder first, then scan it.")
    } catch (error) { setMessage(error.message || "The scan could not finish.") }
    finally { setBusy(false) }
  }

  const next = () => { setMessage(""); setStep((current) => Math.min(totalSteps - 1, current + 1)) }
  const back = () => { setMessage(""); setStep((current) => Math.max(0, current - 1)) }

  const content = [
    {
      eyebrow: "WELCOME, PLAYER",
      title: "Ready for your first project quest?",
      description: "We will do three small things together: choose a project, scan it, and learn what the results mean. You stay in control at every step.",
      icon: Sparkles,
    },
    {
      eyebrow: "QUEST 1 · PICK YOUR PROJECT",
      title: "Choose or download your project.",
      description: "Pick a folder already on your computer, or use Get from GitHub to paste a repository link. FreeBuff downloads a local copy so you can scan, fix, and commit it here.",
      icon: FolderOpen,
    },
    {
      eyebrow: "QUEST 2 · SCAN",
      title: "Let FreeBuff look for a few common risks.",
      description: "A scan points out the file and line, explains what may be wrong, and hides possible secret values. It is a helpful check, not a complete security audit.",
      icon: ScanLine,
    },
    {
      eyebrow: "QUEST 3 · UNDERSTAND BEFORE YOU FIX",
      title: "Read the finding, then choose what happens.",
      description: "Open a result to see the nearby code and suggested next step. For supported Python fixes, inspect the diff and approve it before FreeBuff saves a backup and edits the file.",
      icon: FileCode2,
    },
    {
      eyebrow: "QUEST 4 · GIT AND GITHUB",
      title: "Commit, push, then open a pull request.",
      description: "Make a work branch, create a local commit, then push it. Use a direct PR if you can write to the repository, or choose Fork & create pull request to send your branch from your own fork. Git sends commits and file objects GitHub does not have yet, not a fresh copy of the whole folder each time.",
      icon: GitPullRequest,
    },
  ][step]
  const StepIcon = content.icon

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/80 p-3 backdrop-blur-md sm:p-5">
      <section role="dialog" aria-modal="true" aria-labelledby="guide-title" className="max-h-[94vh] w-full max-w-3xl overflow-auto rounded-3xl border border-line bg-[#0c1219] p-5 shadow-2xl shadow-black/50 sm:p-7">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-mint/20 bg-mint/[.08] text-mint transition duration-300 hover:rotate-6 hover:scale-105"><StepIcon size={21} /></div>
          <div className="min-w-0 flex-1"><div className="mono text-[9px] font-bold tracking-[.2em] text-mint">{content.eyebrow}</div><h2 id="guide-title" className="mt-1 text-xl font-black tracking-tight sm:text-2xl">{content.title}</h2></div>
          <button onClick={onClose} aria-label="Close interactive guide" className="rounded-lg p-2 text-slate-500 transition hover:bg-white/[.05] hover:text-white"><X size={17} /></button>
        </div>
        <Meter step={step} />
        <div className="mt-2 flex items-center justify-between mono text-[9px] uppercase tracking-wider text-slate-600"><span>First project adventure</span><span>Step {step + 1} / {totalSteps}</span></div>

        <p className="mt-6 max-w-2xl text-sm leading-6 text-slate-400">{content.description}</p>

        {step === 0 && <div className="mt-6 grid gap-3 sm:grid-cols-3">{[
          [FolderOpen, "Pick a folder", "Choose your own project."],
          [ScanLine, "Find the clue", "See files and exact lines."],
          [ShieldCheck, "You decide", "Review before any fix is saved."],
        ].map(([Icon, title, text]) => <div key={title} className="group rounded-2xl border border-line bg-white/[.025] p-4 transition duration-300 hover:-translate-y-1 hover:border-mint/25"><Icon size={17} className="text-mint transition group-hover:scale-110" /><h3 className="mt-3 text-xs font-bold text-slate-200">{title}</h3><p className="mt-1 text-[10px] leading-5 text-slate-500">{text}</p></div>)}</div>}

        {step === 1 && <div className="mt-5 rounded-2xl border border-line bg-black/20 p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-xs font-bold text-slate-200"><FolderOpen size={15} className="text-mint" />{workspaceSelected ? `Project ready · ${workspaceName || "selected folder"}` : "No project folder selected yet"}</div>{workspaceSelected && <span className="inline-flex items-center gap-1.5 rounded-full bg-mint/10 px-2.5 py-1 mono text-[9px] text-mint"><Check size={11} />READY</span>}</div><p className="mt-2 text-[10px] leading-5 text-slate-500">Choose a folder that belongs to you. FreeBuff reads files in it only after you select it.</p></div>}

        {step === 2 && <div className="mt-5 rounded-2xl border border-line bg-[#080c11] p-4 sm:p-5"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-400/10 text-sky-200"><ScanLine size={18} /></div><div><div className="text-xs font-bold text-slate-200">Your scan is read-only</div><div className="mt-1 text-[10px] text-slate-500">No app execution · no automatic file edits</div></div></div><div className="mt-4 rounded-xl border border-line bg-black/30 p-3 mono text-[10px]"><div className="text-slate-600">$ freebuf scan ./your-project</div><div className="mt-2 flex items-center gap-2 text-mint"><span className="animate-pulse">●</span>Findings include file, line, risk, and next step</div></div></div>}

        {step === 3 && <div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-rose-400/15 bg-rose-400/[.035] p-4"><div className="flex items-center gap-2 text-xs font-bold text-rose-200"><ShieldCheck size={15} />If a secret is real</div><p className="mt-2 text-[10px] leading-5 text-slate-400">Remove it from code and revoke or rotate it at the service that issued it. Deleting it from the latest file does not erase Git history.</p></div><div className="rounded-2xl border border-mint/15 bg-mint/[.035] p-4"><div className="flex items-center gap-2 text-xs font-bold text-mint"><FileCode2 size={15} />If a fix is offered</div><p className="mt-2 text-[10px] leading-5 text-slate-400">Press <strong>Review safe fix</strong>, check the before-and-after code, then approve only if the change makes sense for your app.</p></div></div>}

        {step === 4 && <div className="mt-5 rounded-2xl border border-line bg-black/20 p-4 sm:p-5"><div className="grid gap-3 sm:grid-cols-4">{[
          [GitBranch, "1 · Branch", "Start a separate work branch."],
          [GitCommitHorizontal, "2 · Commit", "Save your changes locally."],
          [CloudUpload, "3 · Push", "Send that branch to GitHub."],
          [GitPullRequest, "4 · Pull request", "Ask for a review on GitHub."],
        ].map(([Icon, title, text], index) => <div key={title} className="relative rounded-xl border border-line bg-white/[.025] p-3"><div className="flex items-center gap-2 text-mint"><Icon size={15} /><span className="mono text-[8px] text-slate-500">{String(index + 1).padStart(2, "0")}</span></div><div className="mt-2 text-[10px] font-bold text-slate-200">{title}</div><p className="mt-1 text-[9px] leading-4 text-slate-500">{text}</p></div>)}</div><div className="mt-4 flex items-center gap-2 rounded-xl border border-violet-300/10 bg-violet-300/[.035] p-3 text-[9px] leading-5 text-slate-400"><Github size={14} className="shrink-0 text-violet-300" />No write access to a public upstream? FreeBuff can create a personal fork, push your branch there, and open a PR for review. You still need a GitHub login and permission to fork the repository.</div><div className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-black/30 px-3 py-2.5 mono text-[9px] text-slate-500"><Terminal size={13} className="shrink-0 text-mint" /><span className="truncate">git switch -c feature/my-change → commit → fork → PR</span></div></div>}

        {message && <div role="status" className="mt-4 rounded-xl border border-mint/15 bg-mint/[.04] p-3 text-[10px] leading-5 text-mint">{message}</div>}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <div className="flex items-center gap-2"><Button onClick={step === 0 ? onClose : back}><ArrowLeft size={13} />{step === 0 ? "Close" : "Back"}</Button><button onClick={onClose} className="px-2 py-2 text-[10px] text-slate-600 transition hover:text-slate-300">Skip for now</button></div>
          <div className="flex flex-wrap justify-end gap-2">
            {step === 0 && <Button kind="primary" onClick={next}>Start my first quest<Sparkles size={14} /></Button>}
            {step === 1 && <><Button disabled={busy} onClick={chooseProject}>{busy ? <LoaderCircle className="animate-spin" size={14} /> : <FolderOpen size={14} />}Choose a folder</Button><Button onClick={onClose}><Github size={14} />Get from GitHub</Button>{workspaceSelected && <Button kind="primary" onClick={next}>Use selected project<ArrowRight size={14} /></Button>}</>}
            {step === 2 && <Button kind="primary" disabled={busy || !workspaceSelected} onClick={runFirstScan}>{busy ? <LoaderCircle className="animate-spin" size={14} /> : <ScanLine size={14} />}Scan my project</Button>}
            {step === 3 && <><Button onClick={onOpenFindings}><FileCode2 size={14} />Open findings</Button><Button kind="primary" onClick={next}>Continue<ArrowRight size={14} /></Button></>}
            {step === 4 && <Button kind="primary" onClick={onOpenGit}><GitPullRequest size={14} />Open Git & release<ArrowRight size={14} /></Button>}
          </div>
        </div>
      </section>
    </div>
  )
}
