import { useState } from "react"
import { ArrowRight, Check, Eye, EyeOff, GitBranch, GitCommitHorizontal, GitPullRequest, Github, LoaderCircle, LockKeyhole, LogIn, Shield, Terminal, UserPlus } from "lucide-react"
import { Button } from "./ui"

const commands = [
  { prompt: "$", command: "python3 backend/cli.py check --workspace ./my-project", result: "Read-only scan · file and line findings" },
  { prompt: "$", command: "git status --short", result: "Only your project changes are listed" },
  { prompt: "$", command: "git push", result: "New commits sent to GitHub" },
]

export default function AuthScreen({ registered, onSubmit, onRetry, unavailable }) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const isRegister = !registered

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError("")
    try {
      await onSubmit(isRegister ? "register" : "login", { name, email, password })
    } catch (exception) {
      setError(exception.message || "Could not sign in.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070b10] px-4 py-6 text-slate-100 md:px-8 md:py-10">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-70" style={{ backgroundImage: "radial-gradient(circle at 20% 10%, rgba(72, 207, 145, .13), transparent 34%), radial-gradient(circle at 85% 82%, rgba(61, 130, 255, .10), transparent 28%), linear-gradient(rgba(159,191,176,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(159,191,176,.025) 1px, transparent 1px)", backgroundSize: "auto, auto, 32px 32px, 32px 32px" }} />
      <div className="relative mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl items-center gap-7 lg:grid-cols-[1.1fr_.9fr] lg:gap-12">
        <section className="hidden lg:block">
          <div className="inline-flex items-center gap-2 rounded-full border border-mint/20 bg-mint/[.06] px-3 py-2 mono text-[10px] uppercase tracking-[.16em] text-mint"><Shield size={13} /> Your local developer workshop</div>
          <div className="mt-6 flex items-center gap-3"><div className="grid h-14 w-14 place-items-center rounded-2xl border border-mint/20 bg-gradient-to-br from-mint/20 to-mint/[.03] text-mint shadow-glow"><Shield size={28} /></div><div><div className="text-2xl font-black tracking-tight">FreeBuff<span className="text-mint">.</span></div><div className="text-xs text-slate-500">Check code · review fixes · ship with Git</div></div></div>
          <h1 className="mt-9 max-w-xl text-4xl font-black leading-tight tracking-tight xl:text-5xl">Make code work feel <span className="text-mint">clear and safe.</span></h1>
          <p className="mt-4 max-w-lg text-sm leading-7 text-slate-400">A friendly control room for your real project. FreeBuff shows what it found, where it found it, and asks before it saves a supported fix.</p>

          <div className="mt-8 overflow-hidden rounded-2xl border border-line bg-[#090e13]/90 shadow-2xl transition duration-300 hover:-translate-y-1 hover:border-mint/25">
            <div className="flex items-center justify-between border-b border-line px-4 py-3"><div className="flex items-center gap-2"><Terminal size={15} className="text-mint" /><span className="mono text-[10px] text-slate-400">freebuf · local session</span></div><div className="flex gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-400/70" /><span className="h-2 w-2 rounded-full bg-sky-300/70" /><span className="h-2 w-2 rounded-full bg-mint/80" /></div></div>
            <div className="space-y-4 p-4 md:p-5">{commands.map((row) => <div key={row.command} className="group"><div className="flex items-center gap-2 mono text-[11px] md:text-xs"><span className="text-mint">{row.prompt}</span><span className="text-slate-200 transition group-hover:text-mint">{row.command}</span></div><div className="mt-1.5 flex items-center gap-2 pl-4 text-[10px] text-slate-500"><Check size={12} className="text-emerald-400" />{row.result}</div></div>)}</div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-line bg-white/[.025] p-3 transition hover:border-mint/25"><Terminal size={15} className="text-slate-400" /><div className="mt-2 text-[10px] font-bold text-slate-200">CLI ready</div><div className="mt-1 text-[9px] text-slate-600">Easy commands</div></div>
            <div className="rounded-xl border border-line bg-white/[.025] p-3 transition hover:border-mint/25"><GitBranch size={15} className="text-sky-300" /><div className="mt-2 text-[10px] font-bold text-slate-200">Git flow</div><div className="mt-1 text-[9px] text-slate-600">Branch to commit</div></div>
            <div className="rounded-xl border border-line bg-white/[.025] p-3 transition hover:border-mint/25"><Github size={15} className="text-violet-300" /><div className="mt-2 text-[10px] font-bold text-slate-200">GitHub ready</div><div className="mt-1 text-[9px] text-slate-600">Push and PR</div></div>
          </div>
          <div className="mt-5 flex items-center gap-2 text-[10px] text-slate-500"><LockKeyhole size={13} className="text-mint" />Your source code stays on this computer during local checks.</div>
        </section>

        <section className="mx-auto w-full max-w-md rounded-3xl border border-line bg-[#0c1219]/95 p-5 shadow-2xl shadow-black/30 backdrop-blur md:p-8">
          <div className="mb-6 flex items-center gap-3 lg:hidden"><div className="grid h-11 w-11 place-items-center rounded-xl border border-mint/20 bg-mint/10 text-mint"><Shield size={22} /></div><div><div className="text-lg font-extrabold">FreeBuff</div><div className="text-xs text-slate-500">Your local developer workshop</div></div></div>
          {unavailable ? <>
            <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl border border-rose-300/20 bg-rose-300/[.07] text-rose-200"><Terminal size={22} /></div>
            <h2 className="text-2xl font-black">FreeBuff is asleep</h2><p className="mt-2 text-sm leading-6 text-slate-400">Start FreeBuff from its project folder, then come back here.</p>
            <div className="my-5 rounded-xl border border-line bg-black/25 p-4 mono text-xs"><div className="text-slate-600">$</div><div className="mt-1 text-mint">./start.sh</div></div>
            <Button kind="primary" className="w-full !py-3" onClick={onRetry}><LoaderCircle size={15} />Reconnect</Button>
          </> : <>
            <div className="mb-5 flex items-center justify-between"><div><div className="mono text-[9px] uppercase tracking-[.2em] text-mint">{isRegister ? "New player · local account" : "Welcome back · local account"}</div><h2 className="mt-2 text-2xl font-black tracking-tight">{isRegister ? "Create your account" : "Sign in to FreeBuff"}</h2></div><div className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-white/[.035] text-mint">{isRegister ? <UserPlus size={18} /> : <LogIn size={18} />}</div></div>
            <p className="mb-5 text-xs leading-5 text-slate-400">{isRegister ? "One quick setup, then we will take you through your first project like a short game." : "Your project workshop is ready when you are."}</p>
            <div className="mb-5 flex items-center gap-2 rounded-xl border border-line bg-black/20 px-3 py-2.5"><GitCommitHorizontal size={14} className="text-mint" /><div className="h-px flex-1 bg-gradient-to-r from-mint/50 to-sky-400/50" /><GitBranch size={14} className="text-sky-300" /><div className="h-px flex-1 bg-gradient-to-r from-sky-400/50 to-violet-400/50" /><GitPullRequest size={14} className="text-violet-300" /><span className="ml-1 mono text-[9px] text-slate-500">edit → commit → PR</span></div>

            <form onSubmit={submit} className="space-y-3">
              {isRegister && <label className="block text-[11px] font-semibold text-slate-400">Your name<input required autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} className="mt-1.5 w-full rounded-xl border border-line bg-[#080c11] px-3.5 py-3 text-sm text-slate-100 outline-none transition focus:border-mint/50 focus:ring-2 focus:ring-mint/10" placeholder="What should we call you?" /></label>}
              <label className="block text-[11px] font-semibold text-slate-400">Email<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} className="mt-1.5 w-full rounded-xl border border-line bg-[#080c11] px-3.5 py-3 text-sm text-slate-100 outline-none transition focus:border-mint/50 focus:ring-2 focus:ring-mint/10" placeholder="you@example.com" /></label>
              <label className="block text-[11px] font-semibold text-slate-400">Password<div className="relative mt-1.5"><input required type={showPassword ? "text" : "password"} autoComplete={isRegister ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={isRegister ? 12 : 1} maxLength={1024} className="w-full rounded-xl border border-line bg-[#080c11] px-3.5 py-3 pr-12 text-sm text-slate-100 outline-none transition focus:border-mint/50 focus:ring-2 focus:ring-mint/10" placeholder={isRegister ? "At least 12 characters" : "Your password"} /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-slate-500 transition hover:text-mint">{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button></div>{isRegister && <span className="mt-1.5 flex items-center gap-1.5 text-[9px] text-slate-600">{password.length >= 12 ? <Check size={11} className="text-mint" /> : <LockKeyhole size={11} />}{password.length >= 12 ? "Ready to create your local account" : "Use 12 or more characters"}</span>}</label>
              {error && <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-500/[.06] p-3 text-xs leading-5 text-rose-200">{error}</div>}
              <Button kind="primary" disabled={busy} className="w-full !py-3.5 !text-sm">{busy ? <LoaderCircle className="animate-spin" size={16} /> : isRegister ? <UserPlus size={16} /> : <ArrowRight size={16} />}{isRegister ? "Create account and start" : "Open my workspace"}</Button>
            </form>
            <div className="mt-5 rounded-xl border border-line bg-white/[.025] p-3.5"><div className="flex items-center gap-2 text-[10px] font-bold text-slate-300"><LockKeyhole size={13} className="text-mint" />Two separate sign-ins</div><p className="mt-1.5 text-[9px] leading-4 text-slate-500">This account unlocks FreeBuff on this computer only. GitHub access is separate and is used only when you choose Push or Create pull request.</p></div>
          </>}
          <div className="mt-5 flex items-center justify-center gap-2 text-[9px] text-slate-600"><Github size={12} /><span>GitHub credentials are never entered on this screen.</span></div>
        </section>
      </div>
    </main>
  )
}
