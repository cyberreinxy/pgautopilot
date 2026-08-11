# PGAutoPilot — Company & Product Architecture

Status: Living company/product document (self-hosted, two-plane product)
Scope: Entire product — MCP core (server/), Dashboard (`web/`), hosted
SaaS plane, and the self-hosted infrastructure the company runs.

This document is the single source of truth for how PGAutoPilot is structured,
how the **open-source product** and the **hosted paid product** derive from the
_same codebase_, and how the company runs, scales, and monetizes it — entirely
on our own infrastructure. It is written for our growing company: founders,
engineers, and anyone extending the product.

---

## 1. The Business Model (Open-Core, Dual Product)

PGAutoPilot ships as **two products from one engine**:

| Product                   | Who it serves                                                                                    | Auth                            | Cost                       |
| ------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------- | -------------------------- |
| **OSS self-hosted**       | Anyone (incl. competitors) who runs the source to build/own their own database management system | None (local `DASHBOARD_TOKEN`)  | Free (source + installers) |
| **Hosted SaaS (managed)** | Our users — a free tier, then paid managed database management                                   | Accounts (self-hosted identity) | Free tier + paid tiers     |

Why this works: the _engine_ (schema-aware querying, safety gates, dashboard) is
the product and is shared. The _managed value_ — running it for someone, their
data in our Postgres, accounts, security, support, premium features — is the
paid layer we add on top. **Open core: engine free; managed + advanced features
paid.**

## 2. Two Planes, One Codebase

The single most important architectural decision:

```
PLANE A — OSS / local / public          PLANE B — Hosted SaaS (ours)
   user's machine, their PG                our 16GB VPS + our Postgres
   MCP server  →  user's PG                [IdP] → [Engine API] → [our PG]
   gate: local token (no accounts)         gate: account + entitlement
   free, shipped unchanged                 free tier + paid, accounts
```

- **Plane A is untouched by auth.** Public users get the full OSS experience
  today; no account, no cloud, no tax. Its test gate is the existing
  `pnpm -r typecheck / test / lint / build`.
- **Plane B is the same engine + dashboard**, with an added **hosted layer**:
  accounts, entitlements, billing, and (later) premium tools.
- The two planes talk to the same code by **configuration**: the hosted layer is
  enabled by env (`PG_AUTOPILOT_HOSTED=true` + account/Stripe/IdP settings) and
  is inert in OSS builds. There is **no fork of the codebase.**

## 3. How the Same Codebase Extends to Hosting

The engine (packages/core, contracts, api-client, tools, safety) is shared
verbatim. The hosted plane adds **five separable features** behind the hosted
flag:

1. **Identity** — a self-hosted identity provider (recommended: **Authentik**,
   swappable for Zitadel/Keycloak — all OIDC, all self-hosted) that the
   dashboard uses to sign in users (email/password, Google, GitHub, 2FA,
   sessions, lockouts).
2. **Entitlements** — our API decides _what a signed-in user may do_ from their
   tier (free vs paid), stored in our Postgres. Identity proves _who_; our API
   decides _what_.
3. **Billing** — Stripe as the only non-self-hostable dependency (it moves real
   money). All plan logic, invoices, entitlements, and webhooks live in our
   Postgres + API. Free tier and paid tiers are rows, not code forks.
4. **Managed database services** — the hosted engine runs against the user's
   provisioned database on our infrastructure.
5. **Premium feature gate** — a config-driven capability list
   (`capabilities`) per tier; tools not in the list return a clear
   `{ error: "requires <plan>" }` rather than executing.

A user with the OSS build sees the same UI minus the hosted layer. A SaaS user
sees accounts, tiers, and premium tools. Engineers maintain one engine, two
configs.

## 4. Accounts & Identity (Hosted Plane Only)

- **Self-hosted IdP** (Authentik) in Docker on our VPS: OIDC, email+password,
  Google/GitHub, 2FA (TOTP + email OTP), session rotation, lockouts, password
  reset, admin console. We host the IdP; we never hand-roll auth.
- **Browser flow:** dashboard → "Sign in" → redirect to Authentik → back with a
  session; our API validates the OIDC token, looks up/creates the account,
  assigns entitlements, sets an httpOnly session cookie.
- **Security defaults:** httpOnly + Secure + SameSite cookies, short-lived
  tokens with rotation, per-account lockout, per-IP rate limits, no user
  enumeration (generic errors), production masking (no schema/internal leak),
  and the existing redaction list stays the first line of defense.
- Full auth detail: `docs/accounts.md` (spec) and the rollout plan in §9.

## 5. Entitlements & Pricing Model

Tiers are data, not code:

| Tier                         | Example capabilities                                    | Billing                       |
| ---------------------------- | ------------------------------------------------------- | ----------------------------- |
| **Free**                     | dashboard, basic query tools, local-ish limits          | none — the acquisition funnel |
| **Pro (monthly/yearly)**     | managed database, premium tools, higher limits, support | Stripe subscription           |
| **Team/Enterprise (future)** | org accounts, admin, SSO, SLAs, dedicated compute       | Stripe + invoicing            |

- `users.plan`, `users.capabilities[]`, and a `plans` table in our Postgres.
- Webhooks: Stripe `checkout.session.completed`, `customer.subscription.updated/
deleted` → recalc entitlements; access checks read entitlements per request.
- Sign-out/expiry never breaks an existing session; plan changes land on the
  next request.

## 6. Self-Hosted Infrastructure (Company Side)

Run on our own VPS (a 16GiB box comfortably hosts everything; scale later by
splitting services — see §7):

```
VPS (16GiB, Linux) — Caddy :443 (auto-HTTPS, reverse proxy)
 ├── PostgreSQL ............... user/account/billing + tenant DBs
 ├── Redis .................... sessions, queues, rate-limit backing
 ├── Authentik ................ self-hosted IdP (OIDC, 2FA, SSO)
 ├── API (Express) ............ engine + entitlements + webhooks
 ├── Worker ................... async: migrations, emails, billing sync
 └── Observability ............ Prometheus/Grafana, fail2ban, firewall
```

- **Backups:** daily Postgres dumps + point-in-time to off-VPS storage; restore
  drill before going live; keys/pepper separate from the DB.
- **Secrets:** env-only on the VPS (`.env`), never in git, never in the OSS
  repo; IdP secrets, Stripe keys, and signing keys held separately.
- **Caddy** auto-issues and renews TLS; no manual certs.

## 7. Scalability Path (Step, Not Leap)

| Stage     | Infra                                                                         | Trigger                   |
| --------- | ----------------------------------------------------------------------------- | ------------------------- |
| Launch    | 1×16GiB VPS (everything)                                                      | start                     |
| Growth    | same box; bigger disk; Redis already there                                    | thousands of users        |
| Scale-out | split: DB on one box, API+IdP on another, then +API instances behind Caddy/LB | sustained concurrency     |
| Serious   | worker pool + managed DB tier                                                 | 100k+ users / heavy batch |

- Postgres scales "up" comfortably before any "out"; index the `users`,
  `sessions`, `orders` tables.
- IdP is stateless (OIDC); API scales horizontally because the engine has no
  hidden in-memory state that must be shared.
- **The seams were built at day one (DB / IdP / API / worker are separate
  containers), so scaling later is re-running the same containers on more
  machines — not a rewrite.**

## 8. Testing & Verification (Both Planes, Always Green)

- **Shared gate (OSS + hosted), from `web/`:** `pnpm -r typecheck`,
  `pnpm -r lint`, `pnpm -r test`, `pnpm build`; core gate from repo root:
  `npm run typecheck`, `npm run lint`, `npm run build`.
- **OSS plane:** existing suites; nothing about accounts may regress the local
  token path.
- **Hosted plane:** identity mocked (OIDC dev/mock) in CI; dedicated suites for
  entitlements ("free can't call premium, pro can"), billing webhooks, session
  rotation, lockout, and the `{ error }` envelope; real IdP/Stripe interactions
  are exercised manually once per release.
- Every phase ends green before merge; no pushes to `main` before verification.

## 9. Rollout Plan (Phased)

1. **Phase 0 — Foundation:** hosted flag + config, IdP (Authentik) install on
   the VPS, OIDC wiring, `/api/auth/*` + sessions, `/me`, sign-in/sign-out.
2. **Phase 1 — Dashboard accounts UI:** sign-in modal (reuses `docs/accounts.md`
   UI spec), `AuthContext`, Account button wiring, session restore.
3. **Phase 2 — Password reset + email verify:** tokens at rest, flows, mailer.
4. **Phase 3 — Free tier + entitlements:** `plans`/`users` data, capability
   gating, "free" plan live.
5. **Phase 4 — Stripe billing:** checkout, subscriptions, webhooks, plan
   changes, invoices; paid tier live.
6. **Phase 5 — Managed database services:** provision user DBs, quotas,
   isolation.
7. **Phase 6 — Hardening & scale:** lockout tuning, rate limits, audit log +
   Axiom-style telemetry, backups drill, split boxes as growth demands.

Each phase green before merge; the OSS plane never regresses.

## 10. Open Decisions (Tracked)

- IdP pick (Authentik recommended; Zitadel/Keycloak swappable) — decision
  pending, none blocked by it.
- Free-tier limits and Pro pricing thresholds (business, not engineering).
- Whether OSS distribution omits the hosted layer from the bundle or ships it
  inert behind the hosted flag (licensing decision).
- Mailer (dev auto-verify vs production mail) in Phase 2.

## 11. Team Operating Rules (From AGENTS.md)

- Branch discipline: short-lived branches; verify before merge; no `git add -A`.
- No comments in code; Prettier-only formatting; TypeScript strict.
- Attribution: preserve `Co-authored-by` / CREDITS for adapted contributions.
- Bug pipeline: Bug Hunter → Senior Code Architect → QA Verifier; never skip
  verification.

---

_This is the living company/product document. Keep it in sync as decisions
resolve; extend the phased plan rather than branching it. Do not commit secrets;
do not regress the OSS plane while building the hosted one._
