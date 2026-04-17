# Relay

AI-powered social media content management for agencies and small businesses. A productization of Five One Nine's internal Bekah AI pipeline into a user-facing SaaS app.

**Owner:** Five One Nine Marketing
**Status:** In Development (MVP)

---

## Stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **Auth:** Clerk
- **Database:** Neon Postgres + Prisma 7 (pg adapter)
- **UI:** Tailwind v4, shadcn/ui, Radix, Base UI
- **Background jobs:** Trigger.dev (planned)
- **AI:** OpenAI + Anthropic SDKs
- **Storage:** Cloudflare R2
- **Billing:** Stripe
- **Testing:** Vitest, Testing Library

---

## Quickstart

> **Do not clone this repo into Google Drive, Dropbox, iCloud, or any other cloud-synced folder** — Git internals corrupt under sync. Clone to a local-only path (e.g. `~/dev/relay-app`).

```bash
# Clone
gh repo clone accountsFON/relay-app ~/dev/relay-app
cd ~/dev/relay-app

# Configure commit identity (use your personal GitHub identity)
git config user.name "Your Name"
git config user.email "you@example.com"

# Install
npm install

# Env vars — copy the template and fill in from the shared 1Password vault
cp .env.example .env.local

# Generate Prisma client + push schema
npx prisma generate
npx prisma db push

# Dev server
npm run dev
```

App runs at [http://localhost:3000](http://localhost:3000).

---

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint |
| `npm test` | Run Vitest suite |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:coverage` | Vitest with coverage |

---

## Environment Variables

See `.env.example` for the full list. Shared secrets live in the **Five One Nine 1Password vault** under "Relay App" — ask Caleb for access. Never commit `.env.local` or any file with real keys.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full developer workflow — branching, commits, PRs, testing expectations.

**TL;DR:** feature branch → PR → review → merge into `main`. Main is protected.

---

## Documentation

- **Product vision, research, planning docs** live in the Five One Nine vault at `projects/relay-app/` (Google Drive, team-shared).
- **Developer-facing docs** (code, architecture, deployment) live in this repo.

### In-repo

- [CONTRIBUTING.md](CONTRIBUTING.md) — dev workflow
- [AGENTS.md](AGENTS.md) — AI agent rules when working in this repo

### In the vault (read-only from dev perspective)

- Product concept, target users, feature set
- Research on the legacy Bekah AI Make.com pipeline
- Airtable → Postgres migration notes
- Planning: architecture, data model, pages/flows, approval workflow, pricing

---

## License

Private. All rights reserved © Five One Nine Marketing.
