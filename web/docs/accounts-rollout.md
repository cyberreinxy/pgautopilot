# PGAutoPilot — Hosted Accounts Rollout Plan

Status: Approved approach — implementation plan for the hosted (SaaS) plane
Scope: `web/` + hosted infra; OSS plane untouched
Identity: **Authentik** (self-hosted, Docker); swappable for Zitadel/Keycloak

This is the concrete build-out plan for `docs/company.md` §9. It turns the
hosted accounts feature into an ordered, security-first implementation on our
own 16GiB VPS. Everything in this plan is self-hosted except Stripe (payment
processing — the only non-self-hostable dependency, and by design).

---

## 1. Security-First Principles (Non-Negotiable)

1. **Auth is never hand-rolled.** Authentik owns passwords, OAuth, 2FA, session
   rotation, lockouts. We own entitlements and product logic only.
2. **Sessions are httpOnly + Secure + SameSite**, short-lived, with rotation.
3. **Fail closed and opaque.** Generic errors (no user enumeration), production
   masking of internals, secrets env-only, never in git, `VITE_*` carries
   config only.
4. **OSS plane never regresses.** The local token path and existing test gate
   stay green; the hosted layer is config-gated (`PG_AUTOPILOT_HOSTED=true`).
5. **Every phase ends verified** (typecheck, lint, tests, build) before merge.

## 2. Target Infrastructure (16GiB VPS)

```
VPS (16GiB, Linux, e.g. Hetzner/DO/Vultr)
 └── Caddy (public :443, auto-HTTPS, reverse proxy) ── the only public entry
      ├── authentik.  <our-domain>  → Authentik container
      ├── api.        <our-domain>  → Express API
      ├── dashboard.  <our-domain>  → SPA + API (same origin proxy)
      └── (optional) metrics. <domain> → Grafana
 Docker Compose services (one compose stack, separate containers):
  ├── postgres       16GiB-aware tuning; volume + daily dump
  ├── redis          sessions/queue/rate-limit backing
  ├── authentik      server + worker + postgres (bundled DB) — OIDC/SSO
  ├── api            Express engine (built web/apps/api)
  ├── worker         queue worker (async email, billing sync)
  └── monitoring     Prometheus + Grafana (+ fail2ban on host)
```

Resource split on the box: Postgres ~4GiB, Authentik ~2GiB, API/worker ~1GiB
each, Redis ~512MiB, rest headroom for OS + spikes.

## 3. Authentik Setup (Self-Hosted IdP)

- Deploy via official Docker compose; volumes for its DB/media, backed up (§9).
- **Admin:** create the superuser, set a strong initial password.
- **Tenants/Flows to enable (from the Authentik admin):**
  1. Default auth flow — email/password sign-in.
  2. **Sign-up / registration flow** — user self-registration ON (Free tier).
  3. **Password reset flow** — email reset.
  4. **MFA flow** — enable TOTP + email OTP for users (2FA).
  5. **OAuth/SAML providers:** add OAuth apps for **Google** and **GitHub** as
     _sources_ so users can sign in with them (external app registrations
     needed: `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET`).
- **OIDC provider for our API:** Authentik exposes an OIDC application
  (`pgautopilot-api`). Dashboard uses the standard OIDC flow
  (authorization code + PKCE); Authentik returns an ID/access token; our API
  validates it and creates/updates the local account.
- **2FA:** enforced at the flow level (encourage TOTP; email OTP fallback).
  Recovery codes supported by Authentik for MFA.
- The IdP is a **seamless drop-in**: swapping for Zitadel/Keycloak only changes
  the OIDC base URL + client credentials.

## 4. API Integration (OIDC → Our Session)

1. `POST /api/auth/login` → redirect the user to Authentik's authorization
   endpoint (PKCE). On return via `callback`, exchange code → validate ID token
   (signature, issuer, audience) → resolve `email` → upsert our `accounts` row →
   issue **our** session cookie (httpOnly, Secure, SameSite=Lax,
   `__Host-pg_session`).
2. `GET /api/auth/me` — restores the session (reads our cookie + session row).
3. `POST /api/auth/logout` — revokes our session row (server-side) and calls
   Authentik's end-session endpoint; CSRF-guarded.
4. **Rotation:** our session rows rotate the opaque token on a schedule and on
   privilege changes; a reused superseded token revokes the whole family and
   raises an alert (see `docs/accounts.md` §7–§10 — implemented as designed,
   just with Authentik as the upstream IdP instead of a hand-rolled store).
5. **Step-up:** sensitive/premium actions re-require 2FA via Authentik's
   prompt, even inside a valid session.

## 5. Config / Env Vars (Server + Compose)

| Variable                                                                      | Purpose                                        |
| ----------------------------------------------------------------------------- | ---------------------------------------------- |
| `PG_AUTOPILOT_HOSTED=true`                                                    | enables the hosted layer (OSS default: unset)  |
| `PUBLIC_BASE_URL`, `AUTHENTIK_BASE_URL`                                       | callback/redirect bases                        |
| `AUTHENTIK_CLIENT_ID/SECRET`                                                  | OIDC app credentials (server-side only)        |
| `PG_SESSION_SECRET`, `PG_CSRF_SECRET`                                         | cookie/CSRF signing                            |
| `PG_SESSION_TTL_DAYS` (7) / `PG_REMEMBER_TTL_DAYS` (90) / `PG_IDLE_DAYS` (14) | duration policy                                |
| `PG_ROTATION_MIN`                                                             | token rotation cadence                         |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`                | billing                                        |
| `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET`                          | OAuth sources (via Authentik)                  |
| `AUTH_RATE_LIMIT_*`                                                           | existing limiter config (reuse)                |
| `DATABASE_URL`, `REDIS_URL`                                                   | Postgres/Redis                                 |
| `MAIL_*`                                                                      | transactional email (verify/reset/2FA/notices) |

Never: commit `.env`, echo secrets in logs, or expose anything in `VITE_*`
except the API base URL + an OIDC public client id.

## 6. Data Model (Hosted Additions)

```
accounts (ours — the source of entitlement truth)
  id, email (unique), provider, external_id (Authentik uuid),
  plan (free|pro|team), capabilities jsonb, created_at, updated_at

sessions (ours — rotate/revoke our cookie tokens)
  id, family_id, account_id, token_hash (sha-256), csrf_token_hash,
  remember bool, expires_at, slide_at, last_seen_at, ua_fingerprint,
  ip_hash, superseded_by, revoked_at

subscriptions (Stripe mirror)
  id, account_id, stripe_customer_id, stripe_subscription_id,
  status, current_period_end, plan, created_at, updated_at

email_otps / totp_recovery_codes / password_reset_tokens (if we supplement)
  — only if we add any capability Authentik does not already own.
```

Rule: **Authentik owns identity; our `accounts` table owns entitlements.** We
map `external_id` → account. Never store passwords; tokens stored hashed.

## 7. Entitlements & Capability Gating

- `plans` + `users.capabilities[]` are data. A config list defines the union of
  capabilities; each tier gets a subset (see `docs/company.md` §5).
- Access control is a tiny helper: `require(capability)` → 200 or
  `{ error: "requires <plan>" }`. Applied in routers (and, later, at the tool
  gateway) — **never** in the UI only.
- Free tier = acquisition funnel (basic query/dashboard, sensible limits). Pro
  = managed DB + premium tools. Team (future) = orgs + admin + SSO.
- Plan changes: Stripe webhook → update `subscriptions` + recompute
  `capabilities`; next request reflects it. No code deploy for a plan change.

## 8. Stripe Billing Wiring

- Products/prices in Stripe dashboard (monthly + yearly); `STRIPE_PRICE_*` in
  env.
- Checkout: `POST /api/billing/checkout` (Stripe Checkout Session, customer
  created on first checkout) → redirect to Stripe → `checkout.session.completed`
  → mark subscription active.
- Webhooks (verified signature): `customer.subscription.updated` /
  `customer.subscription.deleted` / `invoice.paid` → update rows + entitlements.
  Idempotent handlers (store processed `event_id`s).
- Free tier never touches Stripe (no cards required).
- Billing logic is ours; only card-moving is Stripe's.

## 9. Backups, Secrets, & Recovery

- **Postgres:** daily `pg_dump` + WAL/PITR to off-VPS object storage; restore
  drill **before** launch.
- **Authentik** volumes (its DB + media) backed up with the same cadence.
- **Secrets:** `.env` on the VPS only; keys/pepper separate from DB; never in
  git; IdP/Stripe/session secrets rotated per ops policy.
- **TLS:** Caddy auto-issue + renewal; HSTS on. **Monitoring:** Prometheus +
  Grafana; fail2ban + firewall on the host; alert on lockout/burst events.

## 10. Security Hardening Checklist (Phase 6)

- [ ] Helmet headers on the API (HSTS, CSP, nosniff, frame-deny, referrer)
- [ ] httpOnly + Secure + SameSite + `__Host-` session cookie
- [ ] Short-lived tokens + rotation; superseded ⇒ family revoke + alert
- [ ] CSRF double-submit token on all non-GET auth routes
- [ ] OIDC validation: issuer, audience, signature; PKCE on all code flows
- [ ] Per-account lockout + per-IP rate limits (existing `AUTH_RATE_LIMIT_*`)
- [ ] Generic errors everywhere (no user enumeration); prod masking on
- [ ] Axiom-style redacted auth telemetry (no credentials/cookies in logs)
- [ ] Stripe webhook signature verification + idempotency
- [ ] MCP/raw-SQL path untouched (no account data through tool gateway)
- [ ] OSS build contains no hosted secrets and works with the flag unset

## 11. Testing & Verification Gate

From `web/` (OSS + hosted), plus new hosted suites:

1. `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test`, `pnpm build`
2. **Hosted suites (CI, IdP mocked via OIDC mock):**
   - `auth/oidc.test.ts` — login/callback/me/logout with a mock IdP
   - `auth/session.test.ts` — rotate, revoke, expiry, superseded/family
   - `auth/csrf.test.ts`
   - `entitlements.test.ts` — free can't call premium; pro can; plan change
   - `billing/webhooks.test.ts` — signature, idempotency, plan transitions
   - `SignInModal` + `AuthContext` (RTL), "remember me" duration policy
3. **Manual per release:** real Authentik + real Stripe test-mode flow
   (sign-up → 2FA → checkout → downgrade → sign-out).
4. OSS plane: existing suites must stay green — hosted code is flag-gated.

## 12. Rollout Phases (with Exit Criteria)

| Phase                        | Deliverables                                                                                             | Done when                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 0 — Foundation               | hosted flag; Authentik compose on VPS; OIDC wiring; session cookie + rotation; `/auth/me`, login, logout | mock-IdP auth tests green; OSS gate green         |
| 1 — Dashboard accounts UI    | Sign-in modal (docs/accounts.md §5), AuthContext, Account button, session restore                        | modal E2E green; reduced-motion + a11y pass       |
| 2 — Verify + reset           | email verify, password reset via Authentik flows, mailer                                                 | reset/verify E2E green                            |
| 3 — Free tier + entitlements | `accounts`/`plans`, capability gating, "free" live                                                       | entitlements tests green                          |
| 4 — Stripe                   | checkout, webhooks, plan changes, invoices                                                               | webhook suite green; manual Stripe test-mode pass |
| 5 — Managed DBs              | tenant DB provisioning, quotas, isolation                                                                | provisioning smoke + isolation test               |
| 6 — Hardening & scale        | checklist §10, backups drill, telemetry, split boxes if needed                                           | checklist complete; load smoke on 16GiB           |

Every phase merges only after its gate is green; OSS plane is re-verified each
phase.

## 13. Open Decisions (tracked, none blocking Phase 0)

- Free-tier limits + Pro pricing (business).
- OSS distribution: omit hosted layer vs ship it inert behind the flag
  (licensing).
- Mailer: dev auto-verify vs production mail (Phase 2).
- Whether `__Host-` prefix requires a dedicated cookie domain split from
  dashboard subpath (minor).

---

_This plan assumes Authentik (docs/company.md §4). It is a living document —
update it as decisions resolve. Implementation starts on a short-lived feature
branch and never pushes before the verification gate. No comments in code;
secrets never committed; OSS plane never regresses._
