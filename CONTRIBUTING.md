# Contributing to Relay

This guide is for Five One Nine team members and contractors working on the Relay app.

---

## First-time Setup

### 1. Clone outside any cloud-synced folder

```bash
gh repo clone accountsFON/relay-app ~/dev/relay-app
cd ~/dev/relay-app
```

> ❌ **Do not clone into Google Drive, Dropbox, iCloud, OneDrive, or any synced folder.** Git internals (packfiles, refs, index) corrupt under these sync engines. `~/dev/` or any local-only path is fine.

### 2. Configure Git identity for this repo

Commits should be attributed to your **personal GitHub identity**, not a shared account. Set this per-repo so it doesn't affect other work:

```bash
git config user.name "Your Name"
git config user.email "you@example.com"
```

The email must match a verified email on your personal GitHub account for commits to show up correctly.

### 3. Install deps + set up env

```bash
npm install
cp .env.example .env.local
# Fill in .env.local from the shared 1Password vault ("Relay App" item)
```

### 4. Set up the database

```bash
npx prisma generate
npx prisma db push
```

### 5. Run it

```bash
npm run dev
```

---

## Branching

`main` is protected. **Never push directly to `main`.**

All work happens on feature branches:

```bash
git checkout main
git pull
git checkout -b feat/short-descriptive-name
```

### Branch naming

| Prefix | Use for |
|--------|---------|
| `feat/` | New features |
| `fix/` | Bug fixes |
| `refactor/` | Code restructuring without behavior changes |
| `docs/` | Documentation only |
| `chore/` | Tooling, deps, configs |
| `test/` | Adding or updating tests |

Keep names short and specific: `feat/client-onboarding`, `fix/airtable-sync-crash`.

---

## Commits

Write small, focused commits. Each commit should represent one logical change.

**Format:**

```
<type>: <short summary in imperative mood>

<optional longer body explaining the why>
```

**Types:** `feat`, `fix`, `refactor`, `docs`, `chore`, `test`, `style`, `perf`.

**Examples:**

```
feat: add client approval flow to post detail page
fix: guard onboarding against duplicate user creation
refactor: extract Clerk org lookup into getOrgContext helper
```

**Avoid:** `wip`, `update`, `more changes`, or anything that won't tell the next person what happened.

---

## Pull Requests

### Opening a PR

```bash
git push -u origin feat/your-branch
gh pr create
```

Fill in:
- **Title:** same style as commits — `feat: add X`
- **Summary:** 1–3 bullets on what changed and why
- **Test plan:** checklist of what you verified (or what the reviewer should verify)
- **Screenshots:** for any UI change

### Reviewing

- At least one approval before merge
- Address all comments or explicitly respond why you won't
- Prefer small PRs (under ~400 lines changed) — split large work into stacked PRs if needed

### Merging

- **Squash and merge** is the default for feature branches
- Delete the branch after merge (GitHub will prompt)
- Pull `main` on your local before starting your next branch

---

## Testing

Run the full suite before opening a PR:

```bash
npm test
```

**When to add tests:**
- New API routes / server actions → yes
- New utility functions → yes
- Critical user flows (onboarding, approval, etc.) → yes
- Pure UI tweaks → optional

Tests live in `tests/` mirroring `src/` structure.

---

## Environment & Secrets

- **`.env.local`** — your personal local env file. Never commit.
- **`.env.example`** — template only. Update this when you add a new env var.
- **Shared secrets** live in the Five One Nine **1Password vault**, item "Relay App". Ask Caleb for access if you need it.
- **Never paste secrets into Slack, PRs, commit messages, or Claude Code chats.**

If you accidentally commit a secret, tell Caleb immediately — rotation is faster than repo history rewrites.

---

## The `AGENTS.md` File

If you're using Claude Code, Cursor, or another AI tool in this repo, `AGENTS.md` contains rules the agent should follow. The CLAUDE.md file just points to AGENTS.md so both tools use the same source of truth.

---

## Planning & Context

**Code** lives here.
**Planning and research** live in the Five One Nine vault at `projects/relay-app/` (Google Drive, team-shared).

Before starting non-trivial work:
1. Read the relevant planning doc in the vault
2. Ask in Slack / team channel if scope is unclear
3. If the plan doesn't exist yet, write one (or ask Caleb to) before coding

---

## Deployment

> TODO: fill in once deploy target is confirmed (Vercel is likely).

---

## Questions?

Ask Caleb (caleb@fonmarketing.com) or Julio in the team channel.
