import { AlertTriangle, CheckCircle2, CircleAlert, X } from "lucide-react"

export default function Toast({ toast, onClose }) {
  if (!toast) return null
  const styles = {
    success: { icon: CheckCircle2, color: "text-mint", border: "border-mint/20" },
    warning: { icon: AlertTriangle, color: "text-sky-300", border: "border-sky-400/20" },
    error: { icon: CircleAlert, color: "text-rose-300", border: "border-rose-400/25" },
  }
  const { icon: Icon, color, border } = styles[toast.type] || styles.success
  return (
    <div role="status" className={`fixed bottom-5 right-5 z-50 flex max-w-md items-center gap-3 rounded-xl border ${border} bg-[#101820] px-4 py-3 text-xs text-slate-200 shadow-2xl`}>
      <Icon size={16} className={`shrink-0 ${color}`} />
      <span>{toast.message}</span>
      <button className="ml-1 text-slate-600 hover:text-white" onClick={onClose} aria-label="Dismiss notification"><X size={14} /></button>
    </div>
  )
}

