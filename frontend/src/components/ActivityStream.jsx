import { useEffect, useState } from "react"
import { Activity, Clock3, History, X } from "lucide-react"
import { Button } from "./ui"

const ZONE_KEY = "freebuf-history-timezone"
const TIME_ZONES = [
  ["Asia/Kolkata", "India Standard Time · IST"],
  ["UTC", "UTC"],
  ["America/Los_Angeles", "Pacific Time"],
  ["Europe/London", "United Kingdom · London"],
  ["device", "Use this device's time zone"],
]

function readZone() {
  try { return localStorage.getItem(ZONE_KEY) || "Asia/Kolkata" }
  catch { return "Asia/Kolkata" }
}

function formatDate(value, zone) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Time unavailable"
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: zone === "device" ? undefined : zone,
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    }).format(date)
  } catch {
    return date.toLocaleString("en-IN")
  }
}

export default function ActivityStream({ activity, busy, onClear, onClose }) {
  const [timeZone, setTimeZone] = useState(readZone)

  useEffect(() => {
    try { localStorage.setItem(ZONE_KEY, timeZone) } catch { /* Keep the selection for this view. */ }
  }, [timeZone])

  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === "Escape") onClose() }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="history-title" className="flex max-h-[min(760px,92dvh)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-line bg-[#0b1118] shadow-2xl shadow-black/60">
        <header className="flex flex-col gap-4 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl border border-mint/20 bg-mint/[.08] text-mint"><History size={18} /></div><div><div className="flex items-center gap-2"><Activity size={14} className="text-mint" /><h2 id="history-title" className="text-base font-extrabold text-white">Activity history</h2><span className="rounded-full bg-white/[.06] px-2 py-0.5 mono text-[10px] text-slate-300">{activity.length}</span></div><p className="mt-1 text-xs text-slate-400">Recent actions from this local workspace.</p></div></div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
            <label htmlFor="history-timezone" className="sr-only">Time zone</label>
            <select id="history-timezone" value={timeZone} onChange={(event) => setTimeZone(event.target.value)} className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-[#111923] px-3 text-sm text-slate-100 outline-none focus:border-mint/50 sm:w-[240px] sm:flex-none">
              {TIME_ZONES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <Button disabled={busy || !activity.length} onClick={onClear} className="!px-3 !py-2">Clear</Button>
            <button type="button" onClick={onClose} aria-label="Close activity history" className="rounded-lg p-2 text-slate-300 transition hover:bg-white/[.07] hover:text-white"><X size={18} /></button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {activity.length ? <div className="grid gap-2 sm:grid-cols-2">
            {activity.map((event, index) => <article key={`${event.time}-${index}`} className="grid min-w-0 grid-cols-[16px_minmax(0,1fr)] items-start gap-x-3 gap-y-1 rounded-xl border border-line/80 bg-white/[.025] p-3.5">
              <Clock3 size={15} className="row-span-2 mt-0.5 text-mint/80" />
              <time dateTime={event.time} title={event.time} className="min-w-0 mono text-xs leading-5 text-slate-300">{formatDate(event.time, timeZone)}</time>
              <span className="col-start-2 min-w-0 text-sm leading-5 text-slate-200">{event.message}</span>
            </article>)}
          </div> : <div className="grid min-h-48 place-items-center rounded-xl border border-dashed border-line text-center"><div><Activity className="mx-auto mb-2 text-slate-400" size={22} /><p className="text-sm font-semibold text-slate-200">No activity yet</p><p className="mt-1 text-xs text-slate-400">Your project actions will appear here.</p></div></div>}
        </div>
        <footer className="flex items-center justify-between border-t border-line px-5 py-3 text-xs text-slate-400"><span>Local event log</span><Button onClick={onClose}>Done</Button></footer>
      </section>
    </div>
  )
}
