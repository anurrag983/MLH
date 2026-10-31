import { ArrowDownToLine, CloudUpload, GitBranch, GitCommitHorizontal, GitPullRequest, Github, Link2, Sparkles } from "lucide-react"
import { Button, Card, MarkdownPreview } from "./ui"

export default function ShipPanel({ ship, git, selected, busy, commitMessage, setCommitMessage, remoteUrl, setRemoteUrl, branchName, setBranchName, prTitle, setPrTitle, prBody, setPrBody, onCommit, onPush, onCreateBranch, onCreatePullRequest, onCreateForkPullRequest, onConnect, onShip, onChangelog, focus = "all" }) {
  const repoReady = Boolean(git?.available)
  const showSetup = focus === "all" || focus === "prepare"
  const showPublish = focus === "all" || focus === "publish"
  const showNotes = showPublish
  return (
    <div className={focus === "all" ? "grid gap-4 xl:grid-cols-[.9fr_1.1fr]" : "space-y-4"}>
      <div className="space-y-4">
        {(showSetup || showPublish) && <Card eyebrow="GIT SETUP" title="Save your GitHub repository URL">
          <div className="rounded-lg border border-line bg-black/15 p-3 text-[10px] leading-5 text-slate-400"><div className="flex items-center gap-2 text-slate-200"><GitBranch size={13} /> {!selected ? "Choose a project folder first" : repoReady ? `Git repository · ${git.branch}` : "This folder is not a Git repository"}</div><div className="mt-1 break-all">{git?.remote ? `Saved origin: ${git.remote}` : selected ? "No remote URL is saved for this project yet." : ""}</div></div>
          {repoReady && <><label htmlFor="github-remote-url" className="mt-3 block text-[10px] text-slate-400">GitHub repository URL</label><div className="flex flex-col gap-2 sm:flex-row"><input id="github-remote-url" value={remoteUrl} onChange={(event) => setRemoteUrl(event.target.value)} placeholder="https://github.com/your-name/your-repository.git" aria-label="GitHub repository URL" className="min-w-0 flex-1 rounded-lg border border-line bg-black/20 px-3 py-2.5 mono text-[10px] text-slate-200 outline-none focus:border-mint/40" /><Button disabled={busy || !remoteUrl.trim()} onClick={onConnect}><Link2 size={13} />{git?.remote ? "Update saved URL" : "Save URL"}</Button></div></>}
          <div className="mt-3 rounded-lg border border-mint/10 bg-mint/[.035] p-3 text-[10px] leading-5 text-slate-400"><strong className="text-mint">Save once per project.</strong> FreeBuff stores this URL as <code>origin</code> in the project's <code>.git/config</code>. The URL stays with that folder when you reopen FreeBuff. The first successful push sets the upstream; after that, terminal <code>git push</code> works without repeating the URL.</div>
          <p className="mt-2 text-[10px] leading-5 text-slate-500">FreeBuff uses your existing GitHub login. Authenticate with <code>gh auth login</code> or an SSH key. No GitHub token is requested or stored in FreeBuff.</p>
        </Card>}

        {showSetup && <Card eyebrow="STEP 1 · MAKE A SAFE WORK BRANCH" title="Start your change on its own branch">
          <p className="text-[11px] leading-5 text-slate-400">A branch is a separate track for your changes. Create it before editing or committing so the default branch stays untouched. Your current uncommitted edits stay in the folder when you switch.</p>
          <label htmlFor="work-branch-name" className="mt-3 block text-[10px] text-slate-400">Branch name</label>
          <div className="mt-1.5 flex flex-col gap-2 sm:flex-row"><input id="work-branch-name" value={branchName} onChange={(event) => setBranchName(event.target.value)} placeholder="freebuf/my-change" className="min-w-0 flex-1 rounded-lg border border-line bg-black/20 px-3 py-2.5 mono text-[10px] text-slate-200 outline-none focus:border-mint/40" /><Button disabled={busy || !repoReady || !branchName.trim()} onClick={onCreateBranch}><GitBranch size={13} />Create / switch branch</Button></div>
          {ship.branch_result && <p className={`mt-2 text-[10px] leading-5 ${ship.branch_succeeded ? "text-emerald-300" : "text-rose-200"}`}>{ship.branch_result}</p>}
          <div className="mt-3 rounded-lg border border-line bg-black/15 p-3 mono text-[9px] text-slate-500"><span className="text-mint">$</span> git switch -c freebuf/my-change</div>
        </Card>}

        {showSetup && <Card eyebrow="LOCAL COMMIT" title="Create a commit">
          <label className="mb-2 block text-[10px] text-slate-500">Suggested Conventional Commit message · edit if needed</label>
          <div className="flex flex-col gap-2 sm:flex-row"><input value={commitMessage} onChange={(event) => setCommitMessage(event.target.value)} placeholder="fix(scope): describe the change" className="min-w-0 flex-1 rounded-lg border border-line bg-black/20 px-3 py-2.5 mono text-[10px] text-slate-200 outline-none focus:border-mint/40" /><Button kind="primary" disabled={busy || !repoReady || !commitMessage.trim()} title={!repoReady ? "Choose a Git project folder first" : !commitMessage.trim() ? "Prepare a review to get a suggested message" : "Stage the selected workspace and create a local commit"} onClick={onCommit}><GitCommitHorizontal size={14} /> Commit locally</Button></div>
          <p className="mt-2 text-[10px] leading-5 text-slate-500">This stages all added, edited, and deleted non-ignored files, then saves a local commit. Each commit made here also adds the next numbered entry to CHANGELOG.md with its message, date, and changed files. The changelog entry is part of the same commit; it uploads when you push.</p>
          {ship.commit_result && <div className={`mt-3 rounded-lg border p-3 text-[10px] leading-5 ${ship.commit_succeeded ? "border-emerald-400/20 bg-emerald-500/[.05] text-emerald-200" : "border-rose-400/20 bg-rose-500/[.05] text-rose-200"}`}><strong className="mb-1 block">{ship.commit_succeeded ? "Local commit created" : "Commit status"}</strong><pre className="whitespace-pre-wrap break-words font-sans">{ship.commit_result}</pre></div>}
        </Card>}

        {showPublish && <Card eyebrow="GITHUB PUSH" title="Upload your commit">
          <p className="text-[11px] leading-5 text-slate-400">Push sends your committed branch to its saved tracking remote. After a fork PR, that is your personal fork; on a fresh branch it uses the configured GitHub remote. A direct push to someone else's repository requires write access.</p>
          <Button className="mt-3" disabled={busy || !repoReady || !git?.github_remote} onClick={onPush}><CloudUpload size={14} /> Push to GitHub</Button>
          {!git?.github_remote && <p className="mt-2 text-[10px] text-slate-500">Connect a GitHub repository above to enable push.</p>}
          {ship.push_result && <div className={`mt-3 rounded-lg border p-3 text-[10px] leading-5 ${ship.push_succeeded ? "border-emerald-400/20 bg-emerald-500/[.05] text-emerald-200" : "border-rose-400/20 bg-rose-500/[.05] text-rose-200"}`}><strong className="mb-1 block">{ship.push_succeeded ? "GitHub push complete" : "Push status"}</strong><pre className="whitespace-pre-wrap break-words font-sans">{ship.push_result}</pre></div>}
        </Card>}

        {showPublish && <Card eyebrow="GITHUB REVIEW" title="Open a pull request">
          <div className="flex items-start gap-2 text-[11px] leading-5 text-slate-400"><Github size={15} className="mt-0.5 shrink-0 text-violet-300" /><p>A pull request asks the project owner to review your branch before merging it. You do not need write access to the original public repository when you submit from your own fork.</p></div>
          <label htmlFor="pr-title" className="mt-3 block text-[10px] text-slate-400">Pull request title</label>
          <input id="pr-title" value={prTitle} onChange={(event) => setPrTitle(event.target.value)} placeholder="Describe this change" maxLength={256} className="mt-1.5 w-full rounded-lg border border-line bg-black/20 px-3 py-2.5 text-[11px] text-slate-200 outline-none focus:border-mint/40" />
          <label htmlFor="pr-body" className="mt-3 block text-[10px] text-slate-400">Description · optional</label>
          <textarea id="pr-body" value={prBody} onChange={(event) => setPrBody(event.target.value)} placeholder="What changed, and what should the reviewer check?" maxLength={10000} rows={3} className="mt-1.5 w-full resize-y rounded-lg border border-line bg-black/20 px-3 py-2.5 text-[10px] leading-5 text-slate-200 outline-none focus:border-mint/40" />
          <Button kind="primary" className="mt-3" disabled={busy || !repoReady || !git?.github_remote || !prTitle.trim()} onClick={onCreateForkPullRequest}><GitPullRequest size={14} />Fork &amp; create pull request</Button>
          <p className="mt-2 text-[10px] leading-5 text-slate-500">FreeBuff signs in with your GitHub CLI account, creates your fork if needed, pushes this branch to it, then opens the PR against the saved upstream. It never pushes this action to the original repository.</p>
          <Button className="mt-2" disabled={busy || !repoReady || !git?.github_remote || !prTitle.trim()} onClick={onCreatePullRequest}><GitPullRequest size={14} />Create PR from a branch already pushed to upstream</Button>
          {!git?.github_remote && <p className="mt-2 text-[10px] text-slate-500">Save a GitHub repository URL above first.</p>}
          <p className="mt-2 text-[10px] leading-5 text-slate-500">Before creating a PR: use a work branch, make a commit, and sign in to your GitHub CLI account. Fork PRs need read access to the upstream and the ability to create a fork; private repositories also need the owner's fork policy to allow it.</p>
          {ship.pr_result && <div className={`mt-3 rounded-lg border p-3 text-[10px] leading-5 ${ship.pr_succeeded ? "border-emerald-400/20 bg-emerald-500/[.05] text-emerald-200" : "border-rose-400/20 bg-rose-500/[.05] text-rose-200"}`}><strong className="mb-1 block">{ship.pr_succeeded ? "Pull request created" : "Pull request status"}</strong><pre className="whitespace-pre-wrap break-words font-sans">{ship.pr_result}</pre>{ship.pr_url && <a href={ship.pr_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-mint underline">Open on GitHub <GitPullRequest size={12} /></a>}</div>}
        </Card>}

        {showSetup && <Card eyebrow="CURRENT CHANGES" title="Automated review" action={<Button disabled={busy} onClick={onShip}><Sparkles size={13} /> Prepare review</Button>}>
          <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr className="border-b border-line mono text-[8px] uppercase tracking-wider text-slate-600"><th className="pb-2 pr-3">File</th><th className="pb-2 pr-3">Risk</th><th className="pb-2">Review note</th></tr></thead><tbody>{(ship.review || []).map((row, index) => <tr key={`${row.file}-${index}`} className="border-b border-line/60 last:border-0"><td className="py-3 pr-3 mono text-[9px] text-slate-300">{row.file}</td><td className="py-3 pr-3"><span className={`rounded px-1.5 py-1 mono text-[8px] ${row.risk === "High" ? "bg-rose-500/10 text-rose-300" : row.risk === "Medium" ? "bg-sky-500/10 text-sky-300" : "bg-emerald-500/10 text-emerald-300"}`}>{row.risk}</span></td><td className="py-3 text-[10px] leading-4 text-slate-500">{row.notes}</td></tr>)}</tbody></table>
            {!ship.review?.length && <div className="py-8 text-center text-[10px] text-slate-600">Prepare a review to inspect your current Git changes.</div>}
          </div>
        </Card>}
      </div>
      {showNotes && <Card eyebrow="OPTIONAL AI RELEASE NOTES" title="Release notes" action={<Button disabled={busy || !ship.release_notes} onClick={onChangelog}><ArrowDownToLine size={13} /> Append notes manually</Button>}>
        <div className="min-h-[400px] overflow-auto rounded-lg border border-line bg-[#080c10] p-5"><div className="mb-4 flex items-center gap-2 mono text-[9px] text-slate-600"><GitBranch size={13} /> Generated from local Git status and diff</div><MarkdownPreview text={ship.release_notes} />{!ship.release_notes && <p className="text-xs text-slate-600">Prepare a review to create a summary from this project's changes.</p>}</div>
        <div className="mt-3 text-[10px] leading-5 text-slate-600">Optional: append a longer release summary. Numbered commit entries are added automatically when you commit with FreeBuff; you do not need to use this button for every commit.</div>
        {ship.changelog_result && <p className={`mt-3 text-[10px] ${ship.changelog_saved ? "text-emerald-300" : "text-rose-200"}`}>{ship.changelog_result}</p>}
      </Card>}
    </div>
  )
}
