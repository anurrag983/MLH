import { useState } from "react"
import { ArrowRight, Check, Eye, EyeOff, GitBranch, GitCommitHorizontal, GitPullRequest, Github, LoaderCircle, LockKeyhole, LogIn, Shield, Terminal, UserPlus } from "lucide-react"
import { Button } from "./ui"

const commands = [
  { command: "freebuff check ./my-project", result: "Scan files and see clear findings" },
  { command: "freebuff review", result: "Inspect suggested changes before saving" },
  { command: "git push", result: "Send your committed branch to GitHub" },
]

export default function AuthScreen({ registered, onSubmit, onRetry, unavailable }) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [mode, setMode] = useState(registered ? "login" : "register")
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const isRegister = mode === "register"

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

  const chooseMode = (nextMode) => {
    if (registered && nextMode === "register") return
    setMode(nextMode)
    setError("")
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070910] px-4 py-5 text-slate-100 sm:px-6 lg:px-10 lg:py-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-80" style={{ backgroundImage: "radial-gradient(ellipse at 20% 8%, rgba(72,207,145,.13), transparent 38%), radial-gradient(ellipse at 76% 88%, rgba(90,112,255,.11), transparent 34%), linear-gradient(rgba(159,191,176,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(159,191,176,.025) 1px, transparent 1px)", backgroundSize: "auto, auto, 34px 34px, 34px 34px" }} />

      <div className="relative mx-auto grid min-h-[calc(100vh-2.5rem)] max-w-[1450px] items-center gap-8 lg:min-h-[calc(100vh-4rem)] lg:grid-cols-[1.05fr_.95fr] lg:gap-14 xl:gap-20">
        <section className="mx-auto w-full max-w-2xl py-3 lg:py-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-mint/25 bg-mint/[.07] px-4 py-2.5 mono text-[10px] font-bold uppercase tracking-[.18em] text-mint sm:text-xs"><Shield size={15} /> Your local developer workshop</div>
          <div className="mt-6 flex items-center gap-3 sm:mt-8"><div className="grid h-14 w-14 place-items-center rounded-2xl border border-mint/25 bg-gradient-to-br from-mint/20 to-mint/[.03] text-mint shadow-glow sm:h-16 sm:w-16"><Shield size={30} /></div><div><div className="text-2xl font-black tracking-tight sm:text-3xl">FreeBuff<span className="text-mint">.</span></div><div className="mt-1 text-xs text-slate-400 sm:text-sm">Check code · review fixes · ship with Git</div></div></div>

          <div className="mt-8 max-w-2xl sm:mt-10 lg:mt-12"><p className="mono text-[10px] font-bold uppercase tracking-[.2em] text-mint">A calmer way to ship</p><h1 className="mt-3 text-4xl font-black leading-[1.03] tracking-[-.045em] sm:text-5xl xl:text-6xl">Make code work feel <span className="text-mint">clear and safe.</span></h1><p className="mt-4 max-w-xl text-sm leading-6 text-slate-300 sm:mt-5 sm:text-base sm:leading-7">A friendly control room for your project. See what FreeBuff found, understand each issue, and review a fix before you save it.</p></div>

          <div className="mt-7 overflow-hidden rounded-2xl border border-line bg-[#090e14]/90 shadow-2xl shadow-black/30 transition duration-300 hover:border-mint/25 sm:mt-9">
            <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5"><div className="flex items-center gap-2.5"><Terminal size={16} className="text-mint" /><span className="mono text-[10px] text-slate-300 sm:text-xs">freebuff · your workflow</span></div><div className="flex gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-400/70" /><span className="h-2 w-2 rounded-full bg-sky-300/70" /><span className="h-2 w-2 rounded-full bg-mint/80" /></div></div>
            <div className="space-y-4 p-4 sm:p-5">{commands.map((row) => <div key={row.command} className="group"><div className="flex items-center gap-2 mono text-[11px] sm:text-xs"><span className="text-mint">$</span><span className="text-slate-100 transition group-hover:text-mint">{row.command}</span></div><div className="mt-1.5 flex items-center gap-2 pl-4 text-[10px] text-slate-400 sm:text-[11px]"><Check size={12} className="shrink-0 text-emerald-300" />{row.result}</div></div>)}</div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 sm:mt-4 sm:gap-3">
            <div className="rounded-xl border border-line bg-white/[.025] p-3 transition hover:border-mint/25 sm:p-4"><Terminal size={16} className="text-mint" /><div className="mt-2 text-[10px] font-bold text-slate-100 sm:text-xs">Simple checks</div><div className="mt-1 text-[9px] text-slate-400 sm:text-[10px]">Clear file findings</div></div>
            <div className="rounded-xl border border-line bg-white/[.025] p-3 transition hover:border-sky-300/25 sm:p-4"><GitBranch size={16} className="text-sky-300" /><div className="mt-2 text-[10px] font-bold text-slate-100 sm:text-xs">Safe Git flow</div><div className="mt-1 text-[9px] text-slate-400 sm:text-[10px]">Branch and commit</div></div>
            <div className="rounded-xl border border-line bg-white/[.025] p-3 transition hover:border-violet-300/25 sm:p-4"><Github size={16} className="text-violet-300" /><div className="mt-2 text-[10px] font-bold text-slate-100 sm:text-xs">GitHub ready</div><div className="mt-1 text-[9px] text-slate-400 sm:text-[10px]">Push and open a PR</div></div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-[10px] text-slate-400 sm:mt-5 sm:text-xs"><LockKeyhole size={14} className="text-mint" />Your source stays on this computer during local checks.</div>
        </section>

        <section className="mx-auto w-full max-w-[560px] rounded-[28px] border border-line bg-[#0c1119]/95 p-5 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-7 md:p-9 lg:p-10">
          {unavailable ? <>
            <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl border border-rose-300/20 bg-rose-300/[.07] text-rose-200"><Terminal size={22} /></div>
            <p className="mono text-[10px] font-bold uppercase tracking-[.2em] text-mint">FreeBuff connection</p><h2 className="mt-2 text-2xl font-black sm:text-3xl">FreeBuff is asleep</h2><p className="mt-3 text-sm leading-6 text-slate-300">Start FreeBuff from its project folder, then reconnect to your local workspace.</p>
            <div className="my-6 rounded-xl border border-line bg-black/30 p-4 mono text-xs"><div className="text-slate-500">$</div><div className="mt-1 text-mint">./start.sh</div></div>
            <Button kind="primary" className="w-full !py-3.5 !text-sm" onClick={onRetry}><LoaderCircle size={16} />Reconnect</Button>
          </> : <>
            <div className="mb-6"><p className="mono text-[10px] font-bold uppercase tracking-[.2em] text-mint">{isRegister ? "Start your journey" : "Welcome back"}</p><div className="mt-2 flex items-center justify-between gap-3"><div><h2 className="text-2xl font-black tracking-tight sm:text-3xl">{isRegister ? "Create your workspace." : "Open your workspace."}</h2><p className="mt-2 text-xs leading-5 text-slate-300 sm:text-sm">{isRegister ? "Set up your local FreeBuff account in a moment." : "Sign in to continue where you left off."}</p></div><div className="hidden h-12 w-12 shrink-0 place-items-center rounded-2xl border border-mint/20 bg-mint/[.07] text-mint sm:grid">{isRegister ? <UserPlus size={20} /> : <LogIn size={20} />}</div></div></div>

            <div className="mb-6 grid grid-cols-2 rounded-2xl border border-line bg-[#080c12] p-1.5" role="tablist" aria-label="Account access">
              <button type="button" role="tab" aria-selected={!isRegister} onClick={() => chooseMode("login")} className={`rounded-xl px-3 py-3 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60 ${!isRegister ? "bg-[#202536] text-white shadow-lg" : "text-slate-400 hover:text-white"}`}>Sign in</button>
              <button type="button" role="tab" aria-selected={isRegister} disabled={registered} title={registered ? "An account already exists on this installation. Sign in instead." : undefined} onClick={() => chooseMode("register")} className={`rounded-xl px-3 py-3 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60 ${isRegister ? "bg-[#202536] text-white shadow-lg" : "text-slate-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-slate-400"}`}>Create account</button>
            </div>

            <div className="mb-6 flex items-center gap-3 rounded-xl border border-line bg-black/20 px-4 py-3"><GitCommitHorizontal size={16} className="text-mint" /><div className="h-px flex-1 bg-gradient-to-r from-mint/50 to-sky-400/50" /><GitBranch size={16} className="text-sky-300" /><div className="h-px flex-1 bg-gradient-to-r from-sky-400/50 to-violet-400/50" /><GitPullRequest size={16} className="text-violet-300" /><span className="mono text-[9px] text-slate-400 sm:text-[10px]">edit → commit → PR</span></div>

            <form onSubmit={submit} className="space-y-4">
              {isRegister && <label className="block text-xs font-semibold text-slate-200">Your name<input required autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} className="mt-2 w-full rounded-xl border border-line bg-[#080c12] px-4 py-3.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-mint/55 focus:ring-2 focus:ring-mint/10" placeholder="e.g. Anurag" /></label>}
              <label className="block text-xs font-semibold text-slate-200">Email address<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} className="mt-2 w-full rounded-xl border border-line bg-[#080c12] px-4 py-3.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-mint/55 focus:ring-2 focus:ring-mint/10" placeholder="you@example.com" /></label>
              <label className="block text-xs font-semibold text-slate-200">Password<div className="relative mt-2"><input required type={showPassword ? "text" : "password"} autoComplete={isRegister ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={isRegister ? 12 : 1} maxLength={1024} className="w-full rounded-xl border border-line bg-[#080c12] px-4 py-3.5 pr-12 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-mint/55 focus:ring-2 focus:ring-mint/10" placeholder={isRegister ? "At least 12 characters" : "Your password"} /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute inset-y-0 right-0 grid w-12 place-items-center text-slate-400 transition hover:text-mint">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>{isRegister && <span className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-400">{password.length >= 12 ? <Check size={12} className="text-mint" /> : <LockKeyhole size={12} />}{password.length >= 12 ? "Password is ready" : "Use 12 or more characters"}</span>}</label>
              {error && <div role="alert" className="rounded-xl border border-rose-400/25 bg-rose-500/[.07] p-3.5 text-xs leading-5 text-rose-100">{error}</div>}
              <Button kind="primary" disabled={busy || (registered && isRegister)} className="w-full !rounded-xl !py-4 !text-sm !font-extrabold">{busy ? <LoaderCircle className="animate-spin" size={17} /> : isRegister ? <UserPlus size={17} /> : <ArrowRight size={17} />}{isRegister ? "Create account" : "Sign in to FreeBuff"}</Button>
            </form>

            <div className="mt-5 rounded-2xl border border-line bg-white/[.025] p-4"><div className="flex items-center gap-2 text-xs font-bold text-slate-100"><LockKeyhole size={15} className="text-mint" />Local account, local workflow</div><p className="mt-2 text-[10px] leading-5 text-slate-300 sm:text-[11px]">This sign-in is stored by the FreeBuff installation you connect to. GitHub access is separate and only used when you choose a Git action.</p></div>
          </>}
          <div className="mt-5 flex items-center justify-center gap-2 text-[10px] text-slate-400"><Github size={13} /><span>Never enter your GitHub password here.</span></div>
        </section>
      </div>
    </main>
  )
}
