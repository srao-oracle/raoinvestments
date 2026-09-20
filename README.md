# RaoInvestments

A private, AI-driven portfolio manager for stocks + options — a hedge-fund-style multi-agent
system that develops per-portfolio strategy, scouts/researches/red-teams opportunities, and
proposes sized trades for human approval (it never executes trades itself).

> Personal use only. Access is email-allowlisted. Not investment advice.

## Monorepo layout

```
apps/web/        Next.js 16 app (Vercel) — UI, API routes, cron, agents
apps/worker/     Always-on WebSocket relay (Fly.io) — Massive/Polygon live data fan-out
packages/shared/ Shared zod schemas + generated Supabase types
supabase/        Postgres migrations, seed, config
```

## Getting started

```bash
corepack prepare pnpm@9.15.0 --activate
pnpm install
cp .env.example .env.local   # fill in secrets
pnpm dev                     # runs the web app
```

See the build plan in `~/.claude/plans/` for the full architecture and milestones (M0–M8).

## Scripts

- `pnpm dev` — web app dev server
- `pnpm build` — build shared + web
- `pnpm lint` / `pnpm typecheck` — quality gates (run in CI)

## Stack

Next.js 16 · React 19 · Tailwind v4 · shadcn/ui · Supabase (Postgres/Auth/Realtime) ·
Anthropic SDK Tool Runner · Massive.com (Polygon) market data · lightweight-charts · Recharts.
