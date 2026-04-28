# AI Testing Platform — Architecture

> A prompt-driven, multi-modality AI testing platform. Users describe what their app should do in natural language; the agent plans, executes, and judges tests across browser, mobile, audio, video, and API surfaces.

---

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| **LLM gateway** | OpenRouter | One API for all models; easy BYOK; lets users swap later |
| **Default model** | `x-ai/grok-4-fast` (verify exact ID on OpenRouter) | $0.50/1M tokens, 2M context window — fits PRDs + run history in one call |
| **Frontend** | Next.js 15 (App Router) + React + Tailwind + shadcn/ui | SSR for marketing, client for dashboard, fast to ship |
| **Backend (API)** | Next.js API routes for thin endpoints | Co-located, simple |
| **Orchestrator service** | Standalone Node.js (TypeScript) | Long-running agent loops can't live in serverless functions |
| **Database** | Supabase Postgres + pgvector | Stores runs, configs, embeddings for dedup/clustering |
| **Object storage** | Supabase Storage | Screenshots, videos, audio captures (same project as DB) |
| **Job queue** | `pg-boss` (Postgres-backed) | Avoids adding Redis until volume demands it |
| **Auth** | Supabase Auth | Built-in, integrates natively with Supabase DB row-level security |
| **Browser worker** | Playwright | Multi-browser, mobile emulation, multi-touch, headless |
| **Mobile worker** | Appium (Phase 3) | Real native iOS/Android |
| **Audio worker** | ffmpeg + Whisper API (OpenAI or self-hosted) | Capture + transcribe |
| **Frontend hosting** | Vercel | Native Next.js fit |
| **Orchestrator hosting** | Fly.io | Long-lived workers, websockets, cheap |
| **Repo structure** | Monorepo (pnpm workspaces + Turborepo) | Shared types, atomic commits across services |

---

## 2. Component map

```
┌─────────────────────────────────────────────────────────────┐
│                       Web App (Next.js)                      │
│  Auth · Project setup · Prompt input · Run viewer · GH link  │
└──────────────────────┬──────────────────────────────────────┘
                       │ REST + WebSocket
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  Orchestrator (Node service)                 │
│                                                              │
│  ┌────────────────┐    ┌──────────────────────────────┐    │
│  │ Reverse        │───▶│       Agent Loop              │    │
│  │ Prompter       │    │   plan → act → observe →      │    │
│  │ (Grok)         │    │   judge → repeat              │    │
│  └────────────────┘    └──────┬───────────────────────┘    │
│                                │ tool calls                  │
│         ┌──────────────┬───────┼───────┬─────────────┐      │
│         ▼              ▼       ▼       ▼             ▼      │
└─────────────────────────────────────────────────────────────┘
          │              │       │       │             │
          ▼              ▼       ▼       ▼             ▼
   ┌──────────┐  ┌───────────┐ ┌────┐ ┌──────┐  ┌──────────┐
   │ Browser  │  │ Audio     │ │Mobile│ │Video │  │Cross-ch  │
   │ Worker   │  │ Worker    │ │Worker│ │Worker│  │Email/SMS │
   │(Playwgt) │  │(ffmpeg+W) │ │(Apm) │ │(ffmp)│  │Webhook   │
   └──────────┘  └───────────┘ └──────┘ └──────┘  └──────────┘

   ┌──────────────────────────────────────────────────────┐
   │                Integrations Layer                     │
   │   GitHub App · Sentry · Datadog · Slack · Linear      │
   └──────────────────────────────────────────────────────┘

   ┌──────────────────────────────────────────────────────┐
   │  Postgres (runs, configs, embeddings) · Object Store │
   └──────────────────────────────────────────────────────┘
```

### Agent loop (orchestrator core)

1. **Plan** — Grok reads context (PRD + prompt) → produces ordered test steps
2. **Act** — for each step, Grok picks a tool (click, navigate, capture audio, send API call) and args
3. **Observe** — worker executes, returns DOM/screenshot/audio transcript/network log
4. **Judge** — Grok compares observation against the step's intent → pass/fail/retry
5. **Loop** until plan complete or stuck → emit final report

---

## 3. Phase plan

Same destination ("all of it"), shipped in waves so we get feedback early.

### Phase 1 — Prove the loop (the only thing we build before launch)
- Web app shell + auth + project creation
- Context upload (paste PRD or upload .md/.pdf)
- Browser modality (Playwright pool)
- Agent loop driving Playwright with Grok
- Run viewer: step-by-step timeline with screenshots
- GitHub integration: file new issue on failure (dedup deferred)

### Phase 2 — Intelligence layer
- Reverse prompter (already specced)
- Time-travel debugger with AI narrator
- Failure clustering (pgvector embeddings)
- Synthetic data generator
- Sentry observability correlation

### Phase 3 — Modality expansion
- Audio worker (capture + Whisper + intent matching)
- Video worker (frame sampling + vision check)
- Mobile worker (Appium, real devices via BrowserStack backend or owned)
- Multi-touch gestures
- Cross-channel: email/SMS/webhook verification

### Phase 4 — Workflow + enterprise
- Synthetic monitoring (scheduled prod runs)
- PR impact analysis (diff → relevant tests)
- Adversarial mode (AI tries to break the app)
- Production session → test generation
- Compliance mode (PII redaction, audit trail)
- Auth-flow primitive (OAuth/magic-link/2FA helper)

---

## 4. What you provide vs. what I build

### You provide
- **OpenRouter API key** (paid account, I'll guide signup)
- **Hosting accounts**: Vercel (free tier ok), Supabase or Neon (free tier ok), Fly.io or Railway (~$5-10/mo to start)
- **GitHub App registration** (I'll walk you through it when we get to the integration)
- **Domain name** (later, when we launch)

### I build
- All code: web app, orchestrator, workers, integrations
- Database schemas and migrations
- Deployment configs
- Documentation as we go

---

## 5. Locked decisions (2026-04-28)

- **Auth/DB/Storage**: Supabase (consolidated)
- **Hosting**: Vercel (web) + Fly.io (orchestrator)
- **Repo**: Monorepo with pnpm workspaces + Turborepo
- **LLM**: OpenRouter → Grok 4.1 Fast (default)

## 6. Accounts to create (you)

Sign up for these while I scaffold the code. All have free tiers — no card needed yet:

1. **OpenRouter** — https://openrouter.ai → grab API key
2. **Supabase** — https://supabase.com → create new project, save URL + anon key + service role key
3. **Vercel** — https://vercel.com → connect to GitHub when we deploy
4. **Fly.io** — https://fly.io → install CLI when we deploy
5. **GitHub** — for the repo itself (assume you have this)

I'll need those keys when wiring the integrations, not for scaffolding.
