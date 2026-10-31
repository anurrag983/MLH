import { useCallback, useEffect, useRef, useState } from "react"
import { BookOpen, CheckCircle2, CircleAlert, Download, FileCode2, FolderOpen, FolderPlus, GitCommitHorizontal, GitPullRequest, Github, History, LoaderCircle, ScanLine, Shield, UserRound } from "lucide-react"
import ActivityStream from "./components/ActivityStream"
import AccountDialog from "./components/AccountDialog"
import AuthScreen from "./components/AuthScreen"
import FixReviewDialog from "./components/FixReviewDialog"
import FixPanel from "./components/FixPanel"
import GettingStartedDialog from "./components/GettingStartedDialog"
import GuardPanel from "./components/GuardPanel"
import ShipPanel from "./components/ShipPanel"
import Toast from "./components/Toast"
import WorkflowStepper from "./components/WorkflowStepper"
import { Button, Card } from "./components/ui"
import { getAuthStatus, getState, postAction, postAuth } from "./lib/api"

const emptyState = {
  scan: { score: 0, status: "SELECT A PROJECT", findings: [], audits: [], files_scanned: 0, git: { available: false, remote: "", branch: "", status: "Choose a project folder to begin.", changed_files: [] } },
  ship: { commit_message: "", review: [], release_notes: "" },
  activity: [],
  ai: { provider: "Local Analyzer", status: "Offline checks are ready." },
  workspace: { path: "", name: "" },
  fix: {},
}

const workflowSteps = [
  { id: "project", title: "Choose a project", description: "Select or drop your project folder.", icon: FolderOpen },
  { id: "scan", title: "Scan the project", description: "Run the checks and see what FreeBuff finds.", icon: ScanLine },
  { id: "review", title: "Review the findings", description: "Understand each issue before moving on.", icon: FileCode2 },
  { id: "commit", title: "Prepare and commit", description: "Create a work branch and save your change.", icon: GitCommitHorizontal },
  { id: "publish", title: "Push or open a PR", description: "Send your branch to GitHub when ready.", icon: GitPullRequest },
]

const DROP_SKIP_DIRS = new Set([".git", ".venv", "venv", "node_modules", "vendor", "dist", "build", "coverage", ".next", ".cache", "__pycache__", ".idea", ".vscode", ".freebuf-backups", "work", ".npm", ".yarn", ".tox", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".turbo", "target", ".gradle"])

function skipDroppedPath(path) {
  const parts = path.split("/").filter(Boolean)
  if (parts.slice(0, -1).some((part) => DROP_SKIP_DIRS.has(part) || part.startsWith(".git"))) return true
  const file = parts.at(-1)?.toLowerCase() || ""
  return file === ".netrc" || file === ".npmrc" || file === "id_rsa" || file === "id_ed25519" || file === "credentials.json" || (file.startsWith(".env") && file !== ".env.example") || [".pem", ".p12", ".pfx"].some((extension) => file.endsWith(extension))
}

function isFileTransfer(dataTransfer) {
  return Array.from(dataTransfer?.types || []).includes("Files")
    || Array.from(dataTransfer?.items || []).some((item) => item.kind === "file")
    || Array.from(dataTransfer?.types || []).includes("text/uri-list")
}

function fileFromEntry(entry) {
  return new Promise((resolve, reject) => entry.file(resolve, reject))
}

async function filesFromEntry(entry, prefix = "") {
  if (entry.isDirectory && (DROP_SKIP_DIRS.has(entry.name) || entry.name.startsWith(".git"))) return []
  if (entry.isFile) {
    const relativePath = `${prefix}${entry.name}`
    if (skipDroppedPath(relativePath)) return []
    const file = await fileFromEntry(entry)
    return [{ file, path: relativePath }]
  }
  if (!entry.isDirectory) return []
  const reader = entry.createReader()
  const result = []
  while (true) {
    const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject))
    if (!batch.length) break
    for (const child of batch) {
      const childPrefix = child.isDirectory ? `${prefix}${child.name}/` : prefix
      result.push(...await filesFromEntry(child, childPrefix))
    }
  }
  return result
}

async function collectDroppedProject(transfer) {
  const items = Array.from(transfer.items || []).filter((item) => item.kind === "file")
  const entries = items.map((item) => item.webkitGetAsEntry?.()).filter(Boolean)
  let name = "Dropped-project"
  let selectedFiles = []

  if (entries.length === 1 && entries[0].isDirectory) {
    name = entries[0].name
    selectedFiles = await filesFromEntry(entries[0])
  } else if (entries.some((entry) => entry.isDirectory)) {
    throw new Error("Drop one project folder at a time so its files stay together.")
  } else if (entries.length) {
    selectedFiles = await Promise.all(entries.map(async (entry) => {
      const rows = await filesFromEntry(entry)
      return rows
    })).then((groups) => groups.flat())
  } else {
    selectedFiles = Array.from(transfer.files || []).map((file) => ({ file, path: file.webkitRelativePath || file.name }))
  }

  return collectProjectFiles(selectedFiles, name)
}

async function collectProjectFiles(selectedFiles, name) {
  const files = []
  let totalBytes = 0
  for (const selected of selectedFiles) {
    const file = selected.file || selected
    let path = selected.path || file.webkitRelativePath || file.name
    if (path.startsWith(`${name}/`)) path = path.slice(name.length + 1)
    if (skipDroppedPath(path) || file.size > 1_000_000) continue
    let content
    try { content = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()) }
    catch { continue }
    if (content.includes("\0")) continue
    if (files.length >= 4000) throw new Error("This project has more than 4,000 readable source files after skipping dependencies and build output. Paste the original folder path below to scan the full project and use Git.")
    totalBytes += new TextEncoder().encode(content).byteLength
    if (totalBytes > 25 * 1024 * 1024) throw new Error("Readable project files exceed the 25 MB browser upload limit. Paste the original folder path below to scan the full project and use Git.")
    files.push({ path, content })
  }
  if (!files.length) throw new Error("No readable project text files were found. Choose a source folder or paste the original folder path.")
  return { name, files }
}

export default function App() {
  const [state, setState] = useState(emptyState)
  const [authStatus, setAuthStatus] = useState(null)
  const [authUnavailable, setAuthUnavailable] = useState(false)
  const [ready, setReady] = useState(false)
  const [apiConnected, setApiConnected] = useState(null)
  const [selectedStep, setSelectedStep] = useState(null)
  const [scannedForWorkspace, setScannedForWorkspace] = useState("")
  const [reviewedFindingsKey, setReviewedFindingsKey] = useState("")
  const [busy, setBusy] = useState("")
  const [toast, setToast] = useState(null)
  const [commitMessage, setCommitMessage] = useState("")
  const [workspaceInput, setWorkspaceInput] = useState("")
  const [cloneUrl, setCloneUrl] = useState("")
  const [remoteUrl, setRemoteUrl] = useState("")
  const [branchName, setBranchName] = useState("freebuf/my-change")
  const [prTitle, setPrTitle] = useState("")
  const [prBody, setPrBody] = useState(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [dropActive, setDropActive] = useState(false)
  const [fixPreview, setFixPreview] = useState(null)
  const folderInputRef = useRef(null)
  const folderSelectionResolver = useRef(null)
  const requestSequence = useRef(0)
  const actionInFlight = useRef(false)
  const persistedCommitMessage = useRef("")
  const persistedWorkspace = useRef("")
  const persistedRemote = useRef("")

  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current
    try {
      const next = await getState()
      if (sequence !== requestSequence.current) return
      setState(next)
      setApiConnected(true)
      if (typeof next.ship?.commit_message === "string" && next.ship.commit_message !== persistedCommitMessage.current) {
        persistedCommitMessage.current = next.ship.commit_message
        setCommitMessage(next.ship.commit_message)
      }
      if (next.workspace?.path && next.workspace.path !== persistedWorkspace.current) {
        persistedWorkspace.current = next.workspace.path
        setWorkspaceInput(next.workspace.path)
      }
      const currentRemote = next.ship?.git?.remote || next.scan?.git?.remote || ""
      if (currentRemote !== persistedRemote.current) {
        persistedRemote.current = currentRemote
        setRemoteUrl(currentRemote)
      }
    } catch {
      if (sequence === requestSequence.current) setApiConnected(false)
    } finally {
      if (sequence === requestSequence.current) setReady(true)
    }
  }, [])

  useEffect(() => {
    let active = true
    getAuthStatus().then((status) => {
      if (active) {
        setAuthStatus(status)
        setAuthUnavailable(false)
      }
    }).catch(() => {
      if (active) setAuthUnavailable(true)
    }).finally(() => { if (active) setReady(true) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!authStatus?.authenticated) return undefined
    refresh()
    const timer = setInterval(() => { if (!actionInFlight.current) refresh() }, 1500)
    return () => clearInterval(timer)
  }, [refresh, authStatus?.authenticated])

  useEffect(() => {
    if (!authStatus?.authenticated) return
    const user = authStatus.user?.email?.trim().toLowerCase() || "local-user"
    try { setGuideOpen(localStorage.getItem(`freebuf-first-guide-v3:${user}`) !== "yes") }
    catch { setGuideOpen(true) }
  }, [authStatus?.authenticated, authStatus?.user?.email])

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(null), 5500)
    return () => clearTimeout(timer)
  }, [toast])

  const act = async (endpoint, label, payload) => {
    if (actionInFlight.current) return
    actionInFlight.current = true
    requestSequence.current += 1
    setBusy(endpoint)
    try {
      const data = await postAction(endpoint, payload)
      requestSequence.current += 1
      setApiConnected(true)
      if (endpoint !== "browse-folder") setState(data)
      if (typeof data.ship?.commit_message === "string" && ["ship", "workspace", "import-folder", "clone"].includes(endpoint)) {
        persistedCommitMessage.current = data.ship.commit_message
        setCommitMessage(data.ship.commit_message)
      }
      if (["workspace", "import-folder", "clone"].includes(endpoint) && data.workspace?.path) {
        persistedWorkspace.current = data.workspace.path
        setWorkspaceInput(data.workspace.path)
        const currentRemote = data.ship?.git?.remote || data.scan?.git?.remote || ""
        persistedRemote.current = currentRemote
        setRemoteUrl(currentRemote)
        setBranchName("freebuf/my-change")
        setPrTitle("")
        setPrBody(null)
        setScannedForWorkspace("")
        setReviewedFindingsKey("")
        setSelectedStep(1)
        if (endpoint === "clone") setCloneUrl("")
        const message = endpoint === "import-folder"
          ? `${data.workspace.name} is ready for a local scan.`
          : endpoint === "clone"
            ? `${data.workspace.name} downloaded and ready to scan.`
            : `Using project folder: ${data.workspace.name}`
        setToast({ message, type: "success" })
      } else if (endpoint === "scan") {
        const path = data.workspace?.path || workspace.path
        setScannedForWorkspace(path)
        setReviewedFindingsKey("")
        setSelectedStep((data.scan?.findings || []).length ? 2 : 3)
        setToast({ message: `Scan complete: ${(data.scan?.findings || []).length} finding(s).`, type: "success" })
      } else if (endpoint === "commit") {
        if (data.ship?.commit_succeeded) setSelectedStep(4)
        setToast({ message: data.ship?.commit_result || "Commit action finished.", type: data.ship?.commit_succeeded ? "success" : "warning" })
      } else if (endpoint === "push") {
        if (data.ship?.push_succeeded) setSelectedStep(4)
        setToast({ message: data.ship?.push_result || "Push action finished.", type: data.ship?.push_succeeded ? "success" : "warning" })
      } else if (endpoint === "branch") {
        setToast({ message: data.ship?.branch_result || "Branch action finished.", type: data.ship?.branch_succeeded ? "success" : "warning" })
      } else if (endpoint === "pull-request") {
        if (data.ship?.pr_succeeded) setSelectedStep(4)
        setToast({ message: data.ship?.pr_result || "Pull request action finished.", type: data.ship?.pr_succeeded ? "success" : "warning" })
      } else if (endpoint === "fork-pull-request") {
        if (data.ship?.pr_succeeded) setSelectedStep(4)
        setToast({ message: data.ship?.pr_result || "Fork pull request action finished.", type: data.ship?.pr_succeeded ? "success" : "warning" })
      } else if (endpoint === "apply-fix") {
        setFixPreview(null)
        setToast({ message: data.fix?.saved ? `Saved ${data.fix.file}. A private backup was created.` : label, type: data.fix?.saved ? "success" : "warning" })
      } else if (endpoint === "remote") {
        const currentRemote = data.ship?.git?.remote || data.scan?.git?.remote || remoteUrl
        persistedRemote.current = currentRemote
        setRemoteUrl(currentRemote)
        setToast({ message: "GitHub URL saved as origin for this project folder.", type: "success" })
      } else if (endpoint === "changelog") {
        setToast({ message: data.ship?.changelog_result || label, type: data.ship?.changelog_saved ? "success" : "warning" })
      } else {
        setToast({ message: label, type: "success" })
      }
      return data
    } catch (error) {
      setToast({ message: `${label} failed: ${error.message}.`, type: "error" })
      return null
    } finally {
      setBusy("")
      actionInFlight.current = false
      refresh()
    }
  }

  const reviewFix = async (finding) => {
    if (actionInFlight.current) return
    actionInFlight.current = true
    setBusy("fix-preview")
    try {
      const preview = await postAction("fix-preview", { file: finding.file, line: finding.line, rule: finding.rule })
      setFixPreview(preview)
    } catch (error) {
      setToast({ message: `Could not prepare the fix: ${error.message}`, type: "error" })
    } finally {
      setBusy("")
      actionInFlight.current = false
      refresh()
    }
  }

  const handleAuth = async (action, payload) => {
    const next = await postAuth(action, payload)
    setAuthStatus(next)
    setAuthUnavailable(false)
    if (next.authenticated) await refresh()
  }

  const handleLogout = async () => {
    try {
      const next = await postAuth("logout")
      setAuthStatus(next)
      setAccountOpen(false)
      setFixPreview(null)
      setToast(null)
    } catch (error) {
      setToast({ message: `Could not sign out: ${error.message}`, type: "error" })
    }
  }

  const handleDeleteAccount = async () => {
    const next = await postAuth("delete", { confirmation: "DELETE" })
    setAuthStatus(next)
    setAccountOpen(false)
    setFixPreview(null)
    setToast(null)
    setSelectedStep(null)
    setScannedForWorkspace("")
    setReviewedFindingsKey("")
  }

  const dismissGuide = () => {
    setGuideOpen(false)
    const user = authStatus?.user?.email?.trim().toLowerCase() || "local-user"
    try { localStorage.setItem(`freebuf-first-guide-v3:${user}`, "yes") } catch { /* The guide remains available from the header. */ }
  }

  const browseFolder = () => {
    const input = folderInputRef.current
    if (!input) return Promise.resolve(false)
    input.value = ""
    return new Promise((resolve) => {
      folderSelectionResolver.current = resolve
      const resolver = resolve
      window.addEventListener("focus", () => window.setTimeout(() => {
        if (folderSelectionResolver.current === resolver) {
          folderSelectionResolver.current = null
          resolver(false)
        }
      }, 500), { once: true })
      input.click()
    })
  }

  const handleFolderSelection = async (event) => {
    const selectedFiles = Array.from(event.target.files || [])
    event.target.value = ""
    if (!selectedFiles.length) {
      folderSelectionResolver.current?.(false)
      folderSelectionResolver.current = null
      return
    }
    setBusy("import-folder")
    try {
      const relativePath = selectedFiles[0].webkitRelativePath || selectedFiles[0].name
      const folderName = relativePath.split("/")[0] || "Selected-project"
      const payload = await collectProjectFiles(selectedFiles, folderName)
      const result = await act("import-folder", "Project folder is ready for scanning", payload)
      folderSelectionResolver.current?.(Boolean(result?.workspace?.selected))
    } catch (error) {
      setToast({ message: error.message || "Could not read this folder. Paste its full path below instead.", type: "error" })
      folderSelectionResolver.current?.(false)
    } finally {
      folderSelectionResolver.current = null
      setBusy("")
    }
  }

  const handleFolderDrop = async (event) => {
    event.preventDefault()
    setDropActive(false)
    const transfer = event.dataTransfer
    const uriList = transfer.getData("text/uri-list").split(/\r?\n/).find((value) => value && !value.startsWith("#")) || ""
    const textPath = transfer.getData("text/plain").trim()
    let path = ""
    try {
      if (uriList.startsWith("file://")) path = decodeURIComponent(new URL(uriList).pathname)
      else if (/^(?:\/|[A-Za-z]:\\)/.test(textPath)) path = textPath
      else if (transfer.files?.[0]?.path) path = transfer.files[0].path
    } catch { path = "" }
    try {
      setBusy("reading-folder")
      const payload = await collectDroppedProject(transfer)
      setBusy("")
      await act("import-folder", "Folder imported", payload)
    } catch (error) {
      if (path) {
        setWorkspaceInput(path)
        const result = await act("workspace", "Folder selected", { path })
        if (result?.workspace?.selected) return
      }
      setToast({ message: `${error.message || "Could not read that folder."} You can also paste the folder path below.`, type: "error" })
    } finally {
      setBusy("")
    }
  }

  const scan = state.scan || emptyState.scan
  const ship = state.ship || emptyState.ship
  const workspace = state.workspace || emptyState.workspace
  const git = ship.git || scan.git || {}
  const findings = Array.isArray(scan.findings) ? scan.findings : []
  const activity = Array.isArray(state.activity) ? state.activity : []
  const hasHighFindings = findings.some((finding) => finding.severity === "high")
  const projectSelected = Boolean(workspace.selected || workspace.path)
  const scanComplete = Boolean(projectSelected && workspace.path && scannedForWorkspace === workspace.path)
  const findingsKey = JSON.stringify(findings.map((finding) => [finding.type, finding.rule, finding.file, finding.line]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))))
  const reviewComplete = scanComplete && (findings.length === 0 || reviewedFindingsKey === findingsKey)
  const completedSteps = [projectSelected, scanComplete, reviewComplete, Boolean(ship.commit_succeeded), Boolean(ship.push_succeeded || ship.pr_succeeded)]
  const firstIncompleteStep = completedSteps.findIndex((complete) => !complete)
  const currentStep = firstIncompleteStep < 0 ? workflowSteps.length - 1 : firstIncompleteStep
  const activeStep = selectedStep !== null && selectedStep <= currentStep ? selectedStep : currentStep
  const activeStepInfo = workflowSteps[activeStep]
  const ActiveStepIcon = activeStepInfo.icon

  if (!ready) {
    return <div className="grid min-h-screen place-items-center bg-ink text-slate-300"><div className="flex items-center gap-3 rounded-xl border border-line bg-panel px-5 py-4 text-sm"><LoaderCircle className="animate-spin text-mint" size={18} />Connecting to FreeBuff on this computer…</div></div>
  }

  if (authUnavailable || !authStatus?.authenticated) {
    return <AuthScreen registered={Boolean(authStatus?.registered)} unavailable={authUnavailable} onRetry={() => { setReady(false); getAuthStatus().then((status) => { setAuthStatus(status); setAuthUnavailable(false) }).catch(() => setAuthUnavailable(true)).finally(() => setReady(true)) }} onSubmit={handleAuth} />
  }

  return (
    <div
      className="grid-bg relative min-h-screen text-slate-100 lg:flex lg:h-dvh lg:min-h-0 lg:flex-col lg:overflow-hidden"
      onDragEnter={(event) => { if (isFileTransfer(event.dataTransfer)) { event.preventDefault(); setDropActive(true) } }}
      onDragOver={(event) => { if (isFileTransfer(event.dataTransfer)) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDropActive(true) } }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDropActive(false) }}
      onDrop={(event) => { if (isFileTransfer(event.dataTransfer)) void handleFolderDrop(event) }}
    >
      {dropActive && <div aria-live="polite" className="pointer-events-none fixed inset-3 z-[60] grid place-items-center rounded-3xl border-2 border-dashed border-mint bg-[#07110ddd] text-center shadow-[0_0_80px_rgba(118,247,178,.18)] backdrop-blur-sm"><div><FolderOpen size={46} className="mx-auto text-mint" /><div className="mt-4 text-2xl font-black text-white">Drop your project here</div><div className="mt-2 text-sm text-slate-200">Release anywhere to import files for a local scan</div></div></div>}
      <header className="sticky top-0 z-20 shrink-0 border-b border-line/90 bg-[#080c11]/95 backdrop-blur-xl">
        <div className="mx-auto max-w-[1500px] px-4 md:px-8">
          <div className="flex min-h-[66px] flex-wrap items-center justify-between gap-3 py-2">
            <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-mint/25 bg-mint/10 text-mint shadow-glow"><Shield size={23} /></div><div><div className="text-lg font-extrabold tracking-tight">FreeBuff</div><div className="text-xs text-slate-400">Your local project workshop</div></div></div>
      <div className="flex flex-wrap items-center gap-2"><div className="flex items-center gap-2 rounded-full border border-mint/20 bg-mint/[.06] px-3 py-2 text-xs font-semibold text-mint"><span className="h-2 w-2 rounded-full bg-mint" />{apiConnected ? "Local checks ready" : "Connecting…"}</div><Button onClick={() => setHistoryOpen(true)}><History size={15} />History <span className="rounded-full bg-white/[.08] px-1.5 py-0.5 mono text-[10px]">{activity.length}</span></Button><Button onClick={() => setGuideOpen(true)}><BookOpen size={15} />How to use</Button><Button onClick={() => setAccountOpen(true)}><UserRound size={15} />Account</Button></div>
          </div>
        </div>
      </header>

      <input ref={folderInputRef} type="file" className="hidden" webkitdirectory="" directory="" multiple onChange={handleFolderSelection} aria-label="Choose project folder" />

      <main className="mx-auto flex w-full max-w-[1500px] flex-1 flex-col gap-3 px-4 py-3 md:px-8 lg:min-h-0 lg:overflow-hidden">
        {!apiConnected && <div role="alert" className="flex shrink-0 items-center gap-3 rounded-xl border border-rose-400/25 bg-rose-500/[.08] p-3 text-sm text-rose-100"><CircleAlert size={18} />FreeBuff backend is not connected. Start it with <code>./start.sh</code>.<Button className="ml-auto" onClick={refresh}>Retry</Button></div>}

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 py-1"><h1 className="text-2xl font-extrabold leading-tight tracking-tight md:text-3xl">Let’s finish your project tasks<span className="text-mint">.</span></h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Choose a project, review each step, and decide when your changes are saved or sent to GitHub.</p></div>
          <div className="flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-2 text-xs text-slate-200"><span className={`h-2.5 w-2.5 rounded-full ${apiConnected ? "bg-mint shadow-glow" : "bg-rose-400"}`} />{apiConnected ? "Connected · live sync" : "Disconnected"}</div>
        </div>

        <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[300px_minmax(0,1fr)] xl:gap-6">
          <WorkflowStepper steps={workflowSteps} current={currentStep} active={activeStep} completed={completedSteps} projectName={workspace.name} onSelect={setSelectedStep} />

          <section className="flex min-w-0 flex-col gap-3 lg:min-h-0">
            <div className="relative shrink-0 overflow-hidden rounded-2xl border border-mint/20 bg-gradient-to-br from-[#111d19] via-panel to-[#101720] p-4 shadow-xl shadow-black/15">
              <div aria-hidden="true" className="absolute -right-10 -top-16 h-36 w-36 rounded-full border border-mint/10 bg-mint/[.025]" />
              <div className="relative flex items-center gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-mint/30 bg-mint/[.09] text-mint shadow-glow"><ActiveStepIcon size={22} /></div>
                <div className="min-w-0 flex-1"><div className="mono text-[10px] font-bold uppercase tracking-[.16em] text-mint">Step {String(activeStep + 1).padStart(2, "0")} of {workflowSteps.length}</div><h2 className="mt-0.5 text-lg font-extrabold text-white sm:text-xl">{activeStepInfo.title}</h2><p className="mt-0.5 text-xs leading-5 text-slate-300">{activeStepInfo.description}</p></div>
                {busy && <div className="hidden items-center gap-2 rounded-full border border-mint/20 bg-black/20 px-3 py-2 text-xs font-semibold text-mint sm:flex"><LoaderCircle className="animate-spin" size={15} />Working…</div>}
              </div>
            </div>

            <div className="min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
            {activeStep === 0 && <Card eyebrow="STEP 1 · SELECT YOUR PROJECT" title="Choose a project folder">
              <div className={`flex min-h-[230px] flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-7 text-center transition duration-300 ${dropActive ? "scale-[1.01] border-mint bg-mint/[.08] shadow-glow" : "border-mint/25 bg-gradient-to-b from-mint/[.035] to-transparent hover:border-mint/50 hover:bg-mint/[.05]"}`}>
                <div className="grid h-16 w-16 place-items-center rounded-full border border-mint/25 bg-mint/[.09] text-mint shadow-[0_0_36px_rgba(118,247,178,.12)]"><FolderOpen size={29} /></div>
                <h3 className="mt-4 text-base font-extrabold text-white">Drop your project folder here</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Drop creates a local review copy and skips <code>.git</code>, <code>node_modules</code>, and build folders. For large projects, original-file fixes, or Git, paste the original folder path below.</p>
                <Button kind="primary" className="mt-4 !px-5 !py-2.5 !text-sm" disabled={!!busy || !apiConnected} onClick={browseFolder}><FolderPlus size={17} />Choose project folder</Button>
                <p className="mt-2 max-w-2xl text-[10px] leading-4 text-slate-400">Browser selection imports readable files for scanning. For direct edits and Git, paste the original folder path below. In Finder, hold Option, right-click the folder, and choose “Copy as Pathname.”</p>
              </div>
              <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); act("workspace", "Workspace selection", { path: workspaceInput }) }}>
                <input value={workspaceInput} onChange={(event) => setWorkspaceInput(event.target.value)} placeholder="Or paste the full folder path here" aria-label="Project folder path" className="min-w-0 flex-1 rounded-xl border border-line bg-black/25 px-4 py-3 mono text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-mint/50 focus:ring-2 focus:ring-mint/10" />
                <Button kind="primary" className="!px-5 !py-2.5 !text-sm" disabled={!!busy || !workspaceInput.trim()}><FolderOpen size={16} />Use this folder</Button>
              </form>
              {workspace.path && <div className="mt-4 flex items-start gap-3 rounded-xl border border-mint/20 bg-mint/[.05] p-4"><CheckCircle2 size={20} className="mt-0.5 shrink-0 text-mint" /><div><p className="text-sm font-bold text-emerald-100">Current project: {workspace.name}</p><p className="mt-1 break-all mono text-xs leading-5 text-slate-300">{workspace.path}</p></div></div>}
              <div className="mt-5 border-t border-line pt-5">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-violet-300/20 bg-violet-300/[.08] text-violet-200"><Github size={19} /></div>
                  <div><h3 className="text-sm font-bold text-slate-100">Start from a GitHub project</h3><p className="mt-1 text-xs leading-5 text-slate-300">Paste your friend's repository link. FreeBuff downloads a separate copy to your Documents folder and opens it here.</p></div>
                </div>
                <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void act("clone", "Download project", { url: cloneUrl }) }}>
                  <input value={cloneUrl} onChange={(event) => setCloneUrl(event.target.value)} placeholder="https://github.com/owner/repository" aria-label="GitHub repository URL to clone" autoComplete="url" className="min-w-0 flex-1 rounded-xl border border-line bg-black/25 px-4 py-3 mono text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-mint/50 focus:ring-2 focus:ring-mint/10" />
                  <Button kind="primary" className="!px-5 !py-2.5 !text-sm" disabled={!!busy || !apiConnected || !cloneUrl.trim()}>
                    {busy === "clone" ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />}
                    {busy === "clone" ? "Downloading…" : "Download and open"}
                  </Button>
                </form>
                <div className="mt-3 grid gap-2 text-[11px] leading-5 text-slate-300 sm:grid-cols-3">
                  <div className="rounded-lg border border-line bg-black/15 px-3 py-2"><span className="mr-2 font-bold text-mint">1</span>Paste the repo link</div>
                  <div className="rounded-lg border border-line bg-black/15 px-3 py-2"><span className="mr-2 font-bold text-mint">2</span>FreeBuff downloads a copy</div>
                  <div className="rounded-lg border border-line bg-black/15 px-3 py-2"><span className="mr-2 font-bold text-mint">3</span>Scan, fix, commit, then PR</div>
                </div>
                <p className="mt-2 text-[10px] leading-4 text-slate-400">The original GitHub repository stays unchanged. Public projects can be downloaded without write access. For a private project, sign in to GitHub CLI once before downloading. If macOS blocks the save, allow the terminal running FreeBuff to access Documents.</p>
              </div>
            </Card>}

            {activeStep === 1 && <GuardPanel scan={scan} selected={projectSelected} blocked={hasHighFindings} busy={!!busy} onScan={() => act("scan", "Project scan complete")} />}
            {activeStep === 2 && <FixPanel scan={scan} selected={projectSelected} busy={!!busy} lastFix={state.fix} onScan={() => act("scan", "Project scan complete")} onReviewFix={reviewFix} onContinue={() => { setReviewedFindingsKey(findingsKey); setSelectedStep(3) }} continueDisabled={!scanComplete || hasHighFindings || !!busy} />}
            {activeStep === 3 && <>
              {!git.available && <div role="note" className="rounded-xl border border-sky-300/25 bg-sky-300/[.07] p-4 text-sm leading-6 text-sky-100"><strong className="block text-base">Git is not ready for this folder.</strong><span className="mt-1 block">{git.status || "Choose the project's original root folder or download it from GitHub before committing."}</span></div>}
              <ShipPanel ship={ship} git={git} selected={projectSelected} busy={!!busy} focus="prepare" commitMessage={commitMessage} setCommitMessage={setCommitMessage} remoteUrl={remoteUrl} setRemoteUrl={setRemoteUrl} branchName={branchName} setBranchName={setBranchName} prTitle={prTitle || commitMessage} setPrTitle={setPrTitle} prBody={prBody ?? ship.release_notes ?? ""} setPrBody={setPrBody} onCommit={() => act("commit", "Commit action", { message: commitMessage })} onPush={() => act("push", "GitHub push")} onCreateBranch={() => act("branch", "Work branch", { name: branchName })} onCreatePullRequest={() => act("pull-request", "Pull request", { title: prTitle || commitMessage, body: prBody ?? ship.release_notes ?? "" })} onCreateForkPullRequest={() => act("fork-pull-request", "Fork pull request", { title: prTitle || commitMessage, body: prBody ?? ship.release_notes ?? "" })} onConnect={() => act("remote", "Connect GitHub", { url: remoteUrl })} onShip={() => act("ship", "Git review prepared")} onChangelog={() => act("changelog", "Release notes saved")} />
            </>}
            {activeStep === 4 && <ShipPanel ship={ship} git={git} selected={projectSelected} busy={!!busy} focus="publish" commitMessage={commitMessage} setCommitMessage={setCommitMessage} remoteUrl={remoteUrl} setRemoteUrl={setRemoteUrl} branchName={branchName} setBranchName={setBranchName} prTitle={prTitle || commitMessage} setPrTitle={setPrTitle} prBody={prBody ?? ship.release_notes ?? ""} setPrBody={setPrBody} onCommit={() => act("commit", "Commit action", { message: commitMessage })} onPush={() => act("push", "GitHub push")} onCreateBranch={() => act("branch", "Work branch", { name: branchName })} onCreatePullRequest={() => act("pull-request", "Pull request", { title: prTitle || commitMessage, body: prBody ?? ship.release_notes ?? "" })} onCreateForkPullRequest={() => act("fork-pull-request", "Fork pull request", { title: prTitle || commitMessage, body: prBody ?? ship.release_notes ?? "" })} onConnect={() => act("remote", "Connect GitHub", { url: remoteUrl })} onShip={() => act("ship", "Git review prepared")} onChangelog={() => act("changelog", "Release notes saved")} />}
            </div>
          </section>
        </div>
      </main>
      <FixReviewDialog preview={fixPreview} busy={!!busy} onCancel={() => setFixPreview(null)} onConfirm={() => act("apply-fix", "Save approved fix", { file: fixPreview.file, line: fixPreview.line, rule: fixPreview.rule, source_hash: fixPreview.source_hash })} />
      {guideOpen && <GettingStartedDialog onClose={dismissGuide} workspaceSelected={projectSelected} workspaceName={workspace.name} findingsCount={findings.length} onChooseFolder={browseFolder} onScan={() => act("scan", "Project scan complete")} onOpenFindings={() => { dismissGuide(); setSelectedStep(2) }} onOpenGit={() => { dismissGuide(); setSelectedStep(3) }} />}
      {historyOpen && <ActivityStream activity={activity} busy={!!busy} onClear={() => act("clear-activity", "Activity log cleared")} onClose={() => setHistoryOpen(false)} />}
      {accountOpen && <AccountDialog user={authStatus.user} onClose={() => setAccountOpen(false)} onLogout={handleLogout} onDelete={handleDeleteAccount} />}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}
