import { useEffect, useState } from "react"
import { AlertTriangle, LogOut, Shield, Trash2, UserRound, X } from "lucide-react"
import { Button } from "./ui"

export default function AccountDialog({ user, onClose, onLogout, onDelete }) {
  const [confirmation, setConfirmation] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === "Escape" && !busy) onClose() }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [busy, onClose])

  const removeAccount = async () => {
    if (confirmation !== "DELETE" || busy) return
    setBusy(true)
    setError("")
    try { await onDelete() }
    catch (exception) { setError(exception.message || "The local account could not be deleted.") }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="account-title" className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-[#0b1118] shadow-2xl shadow-black/60">
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl border border-mint/20 bg-mint/[.08] text-mint"><UserRound size={18} /></div><div><h2 id="account-title" className="text-base font-extrabold text-white">Local account</h2><p className="mt-0.5 text-xs text-slate-400">Stored on this computer</p></div></div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close account settings" className="rounded-lg p-2 text-slate-300 transition hover:bg-white/[.07] hover:text-white disabled:opacity-50"><X size={18} /></button>
        </header>
        <div className="space-y-5 p-5">
          <div className="rounded-xl border border-line bg-white/[.025] p-4">
            <div className="text-sm font-bold text-slate-100">{user?.name || "FreeBuff user"}</div><div className="mt-1 break-all text-sm text-slate-300">{user?.email || ""}</div>
            <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2 text-xs text-slate-400"><Shield size={14} className="shrink-0 text-mint" />This account only unlocks FreeBuff on this computer.</div><Button onClick={onLogout} className="shrink-0"><LogOut size={14} />Sign out</Button></div>
          </div>
          <div className="rounded-xl border border-rose-400/25 bg-rose-400/[.055] p-4">
            <div className="flex items-start gap-3"><AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-300" /><div><h3 className="text-sm font-bold text-rose-100">Delete this local account</h3><p className="mt-1 text-xs leading-5 text-slate-300">This removes the saved sign-in, clears FreeBuff’s workspace selection and activity history, and signs you out. Your project folders, imported review copies, backups, Git commits, and GitHub repositories stay on disk. Registering again with the same email creates a new local account.</p></div></div>
            <label className="mt-4 block text-xs font-semibold text-slate-200" htmlFor="delete-account-confirm">Type <span className="mono text-rose-200">DELETE</span> to confirm
              <input id="delete-account-confirm" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" spellCheck="false" className="mt-2 w-full rounded-lg border border-line bg-[#080c11] px-3 py-2.5 mono text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-rose-300/50" placeholder="DELETE" />
            </label>
            {error && <p role="alert" className="mt-3 rounded-lg border border-rose-300/20 bg-rose-300/[.06] px-3 py-2 text-xs text-rose-200">{error}</p>}
            <Button kind="danger" disabled={confirmation !== "DELETE" || busy} onClick={removeAccount} className="mt-4 w-full !py-3 !text-sm">{busy ? "Deleting account…" : <><Trash2 size={15} />Delete local account</>}</Button>
          </div>
        </div>
      </section>
    </div>
  )
}
