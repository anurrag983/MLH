# FreeBuff

FreeBuff is a local project scanner and Git helper. It scans a real project folder, explains supported findings with file and line context, offers narrowly scoped fixes for review, prepares release notes, and creates a local Git commit or GitHub push only when you choose those actions.

## Start it

Requirements: Python 3.9+ and Node.js 18+.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cd frontend && npm install && cd ..
cp .env.example .env
./start.sh
```

Open <http://127.0.0.1:5174>. Keep the terminal running while using FreeBuff. The API stays bound to loopback and the frontend polls local state.

On first launch, create the local account. It is stored on this computer: the password is saved as a salted hash and the browser session uses an HTTP-only cookie. This is a single-user local sign-in, not a hosted identity service or multi-user security boundary.

## Use it with your project

1. Select **Choose project folder** to use the browser folder picker. It imports readable text files for a local scan and skips common dependency and build folders. To work directly on the original files or use Git, paste the full folder path and select **Use this folder**. On macOS, hold Option while right-clicking the folder in Finder and choose **Copy as Pathname**.
2. Or, to start from GitHub, paste the repository's main-page URL into **Start from a GitHub project** and select **Download and open**. FreeBuff clones it into `~/Documents/FreeBuff Projects/<repository>` and selects that local copy. Public repositories can be cloned without write access. For private repositories, sign in to GitHub CLI once with `gh auth login`. If macOS blocks the save, allow the terminal running FreeBuff to access Documents.
3. Select **Scan project**. Every finding shows its file, exact line, nearby redacted code, why it matters, and a recommended next step.
4. For a supported Python finding, select **Review safe fix**, inspect the diff, and choose **Save this change** only if it fits your app. FreeBuff makes a private backup and checks Python syntax before replacing the file. Findings without a verified fix require manual work.
5. In **Git & release**, create a work branch before committing changes. This keeps your work separate from the default branch.
6. Select **Prepare Git review**, inspect the summary, then select **Commit locally**. The commit action stages all added, edited, and deleted non-ignored project files. Each commit made through FreeBuff automatically appends the next numbered entry to `CHANGELOG.md` with the commit message, date, and changed-file list; the changelog is included in that same commit.
7. Select **Push to GitHub** to send the committed branch and its changelog entry to the configured tracking remote. Git transfers commits and file objects the remote does not have yet, rather than uploading an unchanged copy of the whole folder on every push. The first push may include branch history that is missing remotely.
8. For a repository you can write to, push the branch and select **Create PR from a branch already pushed to upstream**. To contribute to a public repository without upstream write access, select **Fork & create pull request**. FreeBuff creates your fork if needed, pushes the branch to your fork, and opens a PR against the saved upstream. The PR asks for review and does not merge by itself.

The selected folder is stored in this installation's ignored `.env` file. The dashboard does not execute your application code. The scanner reads UTF-8 text files up to 1 MB, skips common build/dependency folders, checks common credential patterns and one narrow Python division case, and hides matched secret values in both findings and code context. Its readiness score is a heuristic, not a security certification or proof that code is safe.

The **Account** button shows the local sign-in. **Delete local account** removes that sign-in, clears FreeBuff's saved workspace selection and activity history, and signs you out after you type `DELETE`. It leaves project folders, review copies, backups, Git history, and GitHub repositories untouched. Registering again with the same email creates a new local account.

## GitHub setup

Existing local projects must already be Git repositories. For a GitHub project, use **Download and open** to clone it first; its original repository URL is saved as `origin`. Sign in once with `gh auth login`. Direct push to the upstream needs write access. Fork-based PRs need a GitHub account, read access to the upstream, and permission to create a fork; private repositories also depend on the owner's fork policy. FreeBuff never asks for or stores a GitHub password or token. Commit, push, and pull request are separate actions; push does not force-push.

## Commands

```bash
python backend/cli.py check --workspace /path/to/project
python backend/cli.py ship --workspace /path/to/project
python backend/cli.py commit --workspace /path/to/project
python backend/cli.py push --workspace /path/to/project
```

## Scope and hosting

This version is a single-user local tool. It is intentionally bound to loopback and uses a local sign-in; it is not ready for public hosting or multi-user workspaces. Do not expose this API directly to the internet. Public hosting needs a production identity provider, per-user workspace isolation, a secure remote execution model, deployment configuration, and production storage.

FreeBuff does not run your project's test suite or a performance profiler, execute application code, or provide general AI code rewriting. Run your project's own checks before merging; FreeBuff states these limits in the interface.
