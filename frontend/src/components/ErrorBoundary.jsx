import React from "react"
import { CircleAlert, RefreshCw } from "lucide-react"

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main className="grid min-h-screen place-items-center bg-ink p-6 text-slate-100">
        <section className="max-w-lg rounded-2xl border border-rose-400/20 bg-panel p-7">
          <CircleAlert className="mb-4 text-rose-300" size={28} />
          <h1 className="text-xl font-bold">The dashboard hit a display error</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Your local backend and project files are still available. Reload the dashboard to recover.
          </p>
          <pre className="mt-4 max-h-32 overflow-auto rounded-lg bg-black/30 p-3 text-xs text-rose-200">
            {this.state.error.message}
          </pre>
          <button
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-mint px-4 py-2.5 text-sm font-bold text-ink"
            onClick={() => window.location.reload()}
          >
            <RefreshCw size={15} /> Reload dashboard
          </button>
        </section>
      </main>
    )
  }
}
