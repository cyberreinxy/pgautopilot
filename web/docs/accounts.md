# Accounts & Authentication — Feature Specification

Status: Proposal / design for discussion (upcoming feature, not yet built)
Scope: Dashboard only (`web/`) — `apps/web` frontend, `apps/api` backend,
`packages/contracts` and `packages/api-client`.

This document defines a complete sign-in / accounts system for the PGAutoPilot
dashboard. It exists today only as UI placeholders: a dead **Account** button in
the sidebar footer (`apps/web/src/components/Layout.tsx`) and a placeholder
`/auth` route (`apps/web/src/routes/auth.tsx`). Nothing is wired. This spec
turns that into a secure, production-grade authentication subsystem, keeps the
UI consistent with the existing design system, and explicitly leaves premium /
entitlement features (pricing, paid tiers) out of scope.

---

## 1. Problem Statement

The dashboard's only authentication today is a **static `DASHBOARD_TOKEN`**
bearer gate (`apps/api/src/middleware/auth.ts`) shared by every operator. There
are no users, sessions, passwords, OAuth identities, or account concepts. The
roadmap lists "Authentication and session management UI" as future work.

To support personal accounts and (later) premium services, we must introduce:

- A **user identity** (email + password, plus Google and GitHub identities).
- A **session** that survives reloads and is hardened against XSS, CSRF, brute
  force, session theft, and replay.
- A movable, accessible **sign-in modal** consistent with the existing
  confirmation-modal patterns.
- **2FA** (email OTP and authenticator-app TOTP) on top of first-factor login.
- A **token lifecycle** with rotation and user-controlled session duration
  ("keep me signed in"), so even "sticky" sessions stay rotatable.

## 2. Goals and Non-Goals

### Goals (v1)

- Email + password sign-up / sign-in, with the email verified.
- **Google** and **GitHub** OAuth 2.0 (+ PKCE) with account linking by verified
  email.
- Forgot-password / reset, rate-limited and non-enumerating.
- Secure sessions: **httpOnly `Secure SameSite` cookie**, server-side session
  rows, **short-lived tokens with scheduled + privilege rotation**.
- User-controlled duration: opt in to a 7-day sign-out, or "keep me signed in"
  — while token rotation is **never** disabled (see §7–§8).
- 2FA: authenticator **TOTP** onboarding + verification and **email OTP**, with
  one-time recovery codes.
- Sign-out (revoke), and session restore via `/me` on app boot.
- Hardened out of the box: Helmet headers, rate limiting, lockout, audit
  logging with redaction, and Axiom observability wiring for auth events.
- UI that matches the existing design system and motion rules.

### Non-Goals (explicitly later)

- Premium tiers, pricing, billing, or entitlements.
- Admin / user-management screens.
- SCIM / enterprise SSO (SAML / OIDC beyond the two socials).
- Passkeys / WebAuthn as a first factor (interface reserved, see §20).
- A multi-device "active sessions" management screen (server-side revocation
  exists; the screen is a later slice).

## 3. Core Principles

1. **Secrets live in the environment, never in the repo.** Passwords are
   hashed (argon2id); OAuth client secrets, pepper, and signing/encryption keys
   come from env. Nothing sensitive is echoed, logged, or committed.
2. **Session cookies are httpOnly + Secure + SameSite.** JavaScript cannot read
   them, so an XSS can't exfiltrate a session token. CSRF is handled by
   `SameSite` plus a per-session CSRF token (see §6.5).
3. **Rotation is unconditional.** Every session rotates its token on a schedule
   and on privilege changes; a leaked or reused old token becomes useless
   quickly. "Remember me" extends lifetime, never disables rotation.
4. **Fail closed and opaque.** Unauthorized → `401 { error }`. Unknown email vs
   wrong password vs disabled/locked produce the same message (no user
   enumeration). Production masks internals (`errorHandler`).
5. **Reuse platform conventions.** New endpoints follow the per-route factory +
   Zod validation + `{ error }` envelope pattern in `apps/api`; types live in
   `packages/contracts` and feed the hand-written typed `packages/api-client`;
   UI reuses `packages/ui` components and tokens.
6. **Redaction stays the first line of defense.** `password*`, tokens, and OTP
   secrets are on the sensitive-columns list (`packages/core/src/safety.ts`).
   Account tables are never touched by raw-SQL tools and never emit secrets on
   the wire.
7. **2FA is additive and recoverable.** Recovery codes always provide an escape
   hatch; 2FA is never a lockout trap.

## 4. User Model & Authentication Methods

### Backing store

Table: `accounts` plus a `sessions` table (see §12). Each account has 1..N
identity rows (`account_identities`): one per provider (email/password, google,
github).

### 4.1 Email + Password

- Email is stored lowercased and unique; verified via a one-time email token
  (see Open Questions for preview auto-verify).
- Password policy in §11. Hashing: argon2id (see §6.1). No client-side
  restrictions beyond length; a strength advisor chip is advisory only.

### 4.2 Google Sign-In (OAuth 2.0 Authorization Code + PKCE)

- `GET /api/auth/oauth/google` → builds an authorization URL
  (`scope=openid email profile`, signed single-use `state`, PKCE
  `code_challenge`).
- `GET /api/auth/oauth/google/callback` → exchanges the code (PKCE-verified),
  decodes the **verified** ID token, then issues our session cookie.
- Account creation / linking by **verified** email (see §4.5).
- Prerequisite: register an OAuth app in Google → `GOOGLE_CLIENT_ID` /
  `GOOGLE_CLIENT_SECRET` + registered redirect URI.

### 4.3 GitHub Sign-In (OAuth 2.0 Authorization Code + PKCE)

- `GET /api/auth/oauth/github` → authorization URL (`state` + PKCE).
- `GET /api/auth/oauth/github/callback` → exchange code, read `/user` and
  `/user/emails`, use the **verified primary email** as identity.
- Prerequisite: `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` + redirect URI.

### 4.4 Future methods (extensible)

Magic-link, passkeys/WebAuthn, OIDC/SAML. The `IdentityProvider` interface
(§20) lets a new method plug in without touching sessions/2FA/auth branching.

### 4.5 Multi-method equality

Two methods map to the same account when they share a **verified** email
address. The first verified email creates the account; a later verified method
links to it. Unverified emails never merge.

## 5. Frontend — UI (the Sign-in Modal)

### 5.1 Trigger & placement

- **Signed out:** the sidebar **Account** button (`apps/web/src/components/Layout.tsx`)
  calls `openAuth()`.
- **Signed in:** the button shows an avatar/email chip with sign-out.
- `?auth=signin` / `?auth=signup` deep-links the modal (future "upgrade" CTAs).

### 5.2 Modal structure (matches the confirmation dialog)

Reuse the conventions of `packages/ui/src/components/ConfirmDialog.tsx`:

- Controlled `open` prop via local parent state (null = closed, like
  `settings.tsx` / `tables.tsx`).
- Mounted-on-close with a closing phase, Esc-to-dismiss, backdrop
  `onMouseDown` dismissal (`event.target === event.currentTarget`), focus moved
  into the dialog, `role="dialog" aria-modal="true"`.
- Reuses `.pg-modal-overlay` / `.pg-modal` and the `pg-fade-*/`, `pg-pop-*`
  animations (they already honor `prefers-reduced-motion`).

Layout (`.pg-modal` width `22.5rem`, taller variant), top → bottom:

1. **Brand `Logo`** (existing `packages/ui` `Logo`; icon `pg-primary`,
   wordmark `pg-text`), centered.
2. **Title** — "Sign in to PGAutoPilot".
3. **Error banner** (dismissible) fed by the `{ error }` envelope.
4. **Social buttons** — Google and GitHub, full-width, provider icons, with an
   "or continue with" divider.
5. **Email + password** fields (new primitives, §5.3) with a Show/Hide toggle,
   "Forgot password?" link, and an optional **"Keep me signed in"** checkbox
   (see §8).
6. Primary **Sign in / Create account** button with `loading` and disabled
   while pending (mirrors ConfirmDialog).
7. **Toggle footer** — swap _"Don't have an account? Sign up"_ with _"Already
   have an account? Sign in"_.

Sub-panels (same modal): **Sign up**, **Forgot password**, **Email 2FA**,
**Authenticator 2FA**, **Recovery code**, **Verify email**. One is active at a
time; back/cancel returns to the previous view.

### 5.3 New UI primitives (`packages/ui`)

The existing `pg-input` is mono + `h-full`, unsuitable. Add:
`Input`, `Label`, `FieldError`, `PasswordInput` (visibility toggle), `CodeInput`
(2FA boxes), `SocialButton`, `Divider`. `.pg-field`, `.pg-label`,
`.pg-field-error`, `.pg-social-btn`, `.pg-code-input` under `@layer components`
in `packages/ui/src/styles.css`. All honor reduced-motion and the design tokens.

### 5.4 Auth state (React)

- `AuthContext` (`apps/web/src/features/auth/AuthContext.tsx`) exposes
  `session`, `status` (`loading | signedOut | signedIn`), `signIn`, `signUp`,
  `signOut`, 2FA helpers, `registerChallenge`, `openAuth(view?)`.
- Boot-time `GET /api/auth/me` restores a session from the cookie.
- `session` carries `{ user: { id, email, verified, has2fa }, authMethods }`.

## 6. Security Architecture

### 6.1 Password hashing

- **argon2id**, per-user salt, memory-hard params tuned to the host
  (default `m=19456 (19 MiB), t=2, p=1`), 256-bit output.
- Timing-safe compare (no early return). Rehash-on-login if params change.
- Optional per-install **pepper** (`AUTH_PEPPER`, env-only) pre-pended before
  hashing.

### 6.2 Sessions & cookies

- On login, create a **server-side session row** with an opaque random token
  (referred to below), not a self-encoded JWT. Rows make revocation, rotation,
  and 2FA step-up natural.
- Browser cookie: name `pg_session`, `httpOnly`, `Secure` (production),
  `SameSite=Lax`, `Path=/`; use the `__Host-pg_session` prefix on HTTPS.
- **Forced rotation** on privilege change (login, 2FA completion): old token is
  superseded; reusing a superseded token invalidates the entire family
  (theft signal, see §10).
- **CSRF:** the session cookie is non-readable by JS; mutating auth endpoints
  verify a per-session CSRF token carried in a header/body (double-submit).
  OAuth `state` is signed + single-use; PKCE everywhere.

### 6.3 Brute force / rate limiting

- Reuse `AUTH_RATE_LIMIT_*` primitives (`apps/api/src/middleware/rateLimit.ts`).
- Per-account failed-password counter with **exponential lockout** (e.g.,
  5 → 15m → 1h → 24h), stored server-side.
- Per-IP limits on `/forgot-password`, `/reset-password`, 2FA verification
  (e.g., 5 attempts/code; codes rotate + expire).
- Email OTP: TTL 10 min, single-use, no fast retry.

### 6.4 Password reset

- `crypto.randomBytes(32)`; store only the **SHA-256 hash** (single-use,
  30-minute TTL). Email a link containing the raw token; the UI never reuses it.
- Cross-route, use timing-safe compare throughout.

### 6.5 CSRF

- `SameSite=Lax` blocks most cross-site requests; every non-GET auth route also
  requires the per-session CSRF token (double-submit cookie/header), validated
  in constant time. OAuth callback and state are signed + single-use + PKCE.
- A `Content-Security-Policy` that disallows foreign origins from posting keeps
  the surface small.

### 6.6 Envelope & error hygiene

- Generic boundary errors to prevent **user enumeration**: "Invalid email or
  password"; generic forgot-password response; lockout messaging is uniform.
- Production masking unchanged; no schema/internal text
  (`errorHandler` + `clientErrorMessage`).
- Secrets never reach `VITE_*`; `VITE_*` carries only runtime config like the
  API base URL.

## 7. Token lifecycle — short-lived + rotation

Background: even with "remember me", a session must never be an attacker-forever
token. The browser's cookie encodes an opaque **session token** that is tied to
a server-side row; its validity is bounded by time AND by rotation.

- **Short-lived by default:** the session token has a **configurable short TTL**
  (e.g. 15–30 minutes) as far as the _slot_ it represents.
- **Refresh semantics without a separate refresh token:** on each request, or
  on a **rotating schedule** (e.g. `SESSION_ROTATION=1h`), and always on
  privilege change (login, 2FA), the server:
  1. Validates the presented token against its row (constant-time).
  2. Marks that row `superseded_by` the new row.
  3. Issues a **new cookie** with a new token, same `family_id`.
  4. Reply uses the new cookie (rotation on every slide).
- **Rotation is never nullified by user preference.** "Keep me signed in"
  changes only the _absolute_ and _idle_ limits, never whether the token
  rotates.
- **Replay/theft signal:** if a token arrives for a row already
  `superseded_by`, the whole `family_id` is revoked, an alert is raised
  (Axiom security event), and the user is signed out (see §10).

| Token property | Value                                                                                |
| -------------- | ------------------------------------------------------------------------------------ |
| Storage        | opaque random, server-side row; only SHA-256 hashes in DB                            |
| Cookie         | httpOnly, Secure, SameSite=Lax, `__Host-pg_session`                                  |
| Short-lived    | max-absolute bound per DOI notation (e.g. 7 days not remembered, 90 days remembered) |
| Rotation       | on every request and on schedule (`ROTATION`), never disabled                        |
| Reuse          | superseded token ⇒ invalidate whole family + alert                                   |

## 8. Session duration preference (remember me)

Enable `rememberMe`/`keepMeSignedIn` in the login form. It sets only the
**lifespan policy**; §7 (rotation) is unchanged.

- **Not remembered (default, short-lived).** Absolute expiry **7 days**; no
  sliding refresh past that. Cookie `Max-Age=7d`. Sign-out happens 7 days after
  first login regardless of activity.
- **Remembered ("keep me signed in", "forever").** Long absolute window
  (e.g. **90 days**) with **sliding expiry** (activity extends the deadline up
  to the absolute cap), plus an **idle timeout** (e.g. 14 days of inactivity
  forces re-auth). The token still rotates on the schedule; a leaked token
  remains useless on rotation window.
- Both are exposed as a per-session `expires_at` + slide and stored on the
  session row; the UI labels the remembered path "_Stay signed in for up to 90
  days_" rather than a false promise of true permanence.

| Preference  | Absolute | Idle timeout  | Rotation  |
| ----------- | -------- | ------------- | --------- |
| Default     | 7 days   | — (fixed TTL) | always on |
| Remember me | 90 days  | 14 days       | always on |

## 9. Hardened tooling & observability

Dependencies to pin and where they plug in:

| Tool                                                                          | Use                                                   | Why                                                                               |
| ----------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------- |
| `helmet`                                                                      | Express middleware (headers)                          | Sets HSTS, CSP, `X-Content-Type-Options`,                                         |
| `X-Frame-Options`, `Referrer-Policy` in one call; big default-hardening win   |
| `express-rate-limit`                                                          | per-IP limiter, per-route                             | Consistent brute-force defense on auth routes (reused/backed by existing limiter) |
| `argon2` (or `@node-rs/argon2`)                                               | password hashing                                      | Memory-hard, NIST-recognized                                                      |
| `otplib` (or `otpauth`) + `qrcode`                                            | TOTP + QR provisioning                                | standards, works offline                                                          |
| `openid-client`                                                               | Google OAuth/OIDC                                     | Library-grade OAuth2/OIDC (PKCE, token validation)                                |
| `cookie-parser`                                                               | parse cookies                                         | Required for `httpOnly` session + CSRF tociens                                    |
| Axiom (`axiom-js`/`axiom-middleware`)                                         | observability                                         | Structured **security + audit** logging of                                        |
| login, failures, lockouts, rotation, 2FA, sign-out — with strict redaction of |
| cookies/authorization/passwords/tokens BEFORE sending                         |
| `zod`                                                                         | request validation                                    | Already used; keep one schema source in contracts                                 |
| `jose` (optional)                                                             | signing OAuth `state`, CSRF (or `crypto.randomBytes`) | If we ever need signed vs opaque (state stays opaque-by-default)                  |

> Axiom is used for **security telemetry only**: redact the request logger so
> cookie, `authorization`, and all `password*`/`token*` fields never leave the
> server. Logging must not re-introduce the very values the safety layer
> redacts.

## 10. Additional protections

- **Anomaly alerting:** reuse-theft detection (superseded token), lockout, and
  reset/2FA bursts emit Axiom security events; operators can alert on them.
- **Session context fingerprint:** store `user_agent` (hashed) + rough IP on the
  session; material change flags for step-up (never hard-denies on IP).
- **Active session hygiene:** sessions list + revoke endpoint (server-side); a
  future UI exposes it. Signing-out everywhere revokes the family.
- **Cross-tab sign-out:** broadcast a `storage`/`BroadcastChannel` event so other
  tabs refresh `/me` immediately after sign-out.
- **Step-up authentication:** 2FA can be required again for sensitive/premium
  actions, even within a valid session.
- **Audit log:** append-only, redacted (who, when, what, provider, IP-normalized,
  outcome); never credential material.
- **Global guards:** account is disabled after prolonged lockout; forgot-password
  always returns 200; verification tokens single-use; TOTP ±1-step drift.
- **Headers & transport:** HTTPS in production; the API already disables
  `x-powered-by`; add `helmet`'s HSTS/CSP even behind a proxy (maintained via
  config). Local `127.0.0.1` dev is exempt from forced-HTTPS.

## 11. Password Requirements

| Policy       | Value                                       |
| ------------ | ------------------------------------------- |
| Min length   | 10                                          |
| Max length   | 128                                         |
| Complexity   | none enforced (advisory strength chip only) |
| Hashing      | argon2id (§6.1)                             |
| Reset re-use | disallowed (single-use tokens; fresh hash)  |

## 12. Data model (tables)

```
accounts                  account_identities         sessions
  id uuid PK               id uuid PK                   id uuid PK
  email text UNIQUE         account_id uuid FK          family_id uuid (family)
  email_verified bool       provider text               account_id uuid FK
  created_at                provider_id text            secret_hash text UNIQUE
  updated_at                email text                   csrf_token_hash text
  totp_secret_enc           password_hash                remember bool
  recovery_codes_set        verified_at                 expires_at timestamptz
  created_at                updated_at                  slide_at timestamptz
                                                       last_seen_at
                                                       ua_fingerprint text
                                                       ip_hash text
                                                       superseded_by uuid
                                                       revoked_at timestamptz

  email_otps                totp_recovery_codes        password_reset_tokens
    id, account_id           id, account_id              id, account_id
    code_hash                code_hash UNIQUE            token_hash UNIQUE
    expires_at               used_at                     expires_at, used_at
    consumed_at               created_at
```

Notes:

- One account → 1..N `account_identities` (email/password, google, github),
  merged only on verified email match.
- **Hashes only at rest:** `password_hash`, `secret_hash`, `token_hash`,
  `code_hash`. TOTP secret stored encrypted (`totp_secret_enc`) — see Open
  Questions for the store-vs-masked recommendation.
- Sessions carry `superseded_by`, `family_id`, `remember`, and lifecycle clocks
  so rotation, reuse-detection, revocation and lockout are a lookup away.
- Migration: add during Phase 0; extend during Phase 3/4 (2FA, OAuth, sessions).

## 13. API surface (contract)

Mounted under `/api`; every request validates a Zod schema from
`packages/contracts/src/auth.ts`; errors in `{ error }`.

| Method | Path                             | Purpose                  | Notes                                                          |
| ------ | -------------------------------- | ------------------------ | -------------------------------------------------------------- |
| POST   | `/auth/register`                 | email+password sign-up   | policy check; starts email verify                              |
| POST   | `/auth/verify-email`             | consume verify token     | single-use                                                     |
| POST   | `/auth/login`                    | email+password           | lockout; `{ rememberMe }` sets lifespan; issues session cookie |
| POST   | `/auth/logout`                   | revoke current session   | CSRF-guarded                                                   |
| GET    | `/auth/me`                       | current user + providers | restores session                                               |
| POST   | `/auth/send-verification-email`  | resend                   | rate-limited                                                   |
| POST   | `/auth/forgot-password`          | email reset link         | always 200                                                     |
| POST   | `/auth/reset-password`           | redeem + new password    |                                                                |
| POST   | `/auth/refresh`                  | rotate session token     | used if rotation is not per-request                            |
| POST   | `/auth/2fa/email/request`        | send email OTP           |                                                                |
| POST   | `/auth/2fa/email/verify`         | check email OTP          |                                                                |
| POST   | `/auth/2fa/totp/enroll`          | create secret + QR       |                                                                |
| POST   | `/auth/2fa/totp/verify`          | confirm + enable         |                                                                |
| POST   | `/auth/2fa/totp/disable`         | password/recovery        |                                                                |
| POST   | `/auth/2fa/recovery/verify`      | redeem recovery          |                                                                |
| POST   | `/auth/2fa/recovery/regenerate`  | new codes                |                                                                |
| GET    | `/auth/oauth/:provider/start`    | build redirect URL       | pkce + state                                                   |
| GET    | `/auth/oauth/:provider/callback` | code → session           |                                                                |
| GET    | `/auth/sessions`                 | list own sessions        |                                                                |
| POST   | `/auth/sessions/:id/revoke`      | revoke one/other session |                                                                |

Contract types (`packages/contracts/src/auth.ts`):
`RegisterRequest`, `LoginRequest` (with `rememberMe`), `VerifyEmailRequest`,
`RefreshRequest`, `ResetPasswordRequest`, `TotpEnrollRequest`,
`TotpVerifyRequest`, `OtpVerifyRequest`, `RecoveryVerifyRequest`,
`RevokeSessionRequest`, `SessionState`, `AuthUser`, `Providers`. Zod body
schemas + TS response types, per existing style.

## 13. Frontend — files & wiring

- `apps/web/src/components/SignInModal.tsx`
- `apps/web/src/features/auth/AuthContext.tsx`
- `apps/web/src/lib/authClient.ts` — `createApiClient(...)` with auth methods
- `apps/web/src/components/Layout.tsx` — Account button → `openAuth()`, avatar chip
- `apps/web/src/app/providers.tsx` — mount `AuthProvider`
- `packages/ui/src/components/{Input,Label,FieldError,PasswordInput,CodeInput,SocialButton}.tsx` + `index.ts`
- `packages/ui/src/styles.css` — `.pg-*` auth classes
- `apps/api/src/routes/auth.ts` — `createAuthRouter(...)`
- `apps/api/src/auth/{hash,session,csrf,rotation,oauth,twoFactor,reset,mail}.ts`
- `apps/api/src/middleware/` — `session.ts`, `csrf.ts`, `securityHeaders.ts`
- `packages/contracts/src/auth.ts` + re-export
- `packages/api-client/src/` — typed auth methods

## 14. Integration with the existing platform

| Layer                                     | Change                                                              |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `apps/api/src/app.ts`                     | `helmet`; `session` + `csrf` middleware; Axiom auth logger          |
| `apps/api/src/routes/index.ts`            | mount `createAuthRouter(config, authServices, mailer, rateLimiter)` |
| `apps/api/src/config.ts` + `.env.example` | `AUTH_*`, OAuth IDs/secrets, cookie, pepper, rotation, Axiom        |
| `packages/contracts`                      | `auth.ts` schemas/types; re-export                                  |
| `packages/api-client`                     | hand-written typed auth methods (no codegen)                        |
| `packages/ui`                             | form + auth components/tokens                                       |
| `apps/web`                                | `AuthContext`, `SignInModal`, deep-link, Account wiring             |
| migrations                                | new `auth.*` tables                                                 |

The **MCP raw-tool path is intentionally untouched**: running SQL keeps the static
token gate; browser sessions gate only the account UI and (future) premium
access. Raw-SQL tools never see or touch account tables.

## 15. Phased rollout

1. **Phase 0 — Foundation:** config/env, argon2, session + rotation + cookie
   middleware, `/me`, `/register`, `/login`, `/logout`, `/refresh`. Auto-verify
   email in preview.
2. **Phase 1 — UI modal:** fields, show/hide, sign-in/sign-up toggle,
   "remember me", errors, `AuthContext` restore, Account wiring.
3. **Phase 2 — Password reset + email verify:** tokens at rest, UI, templates.
4. **Phase 3 — OAuth:** Google + GitHub, PKCE + `state`, linking (external
   app registrations).
5. **Phase 4 — 2FA:** TOTP + QR + recovery + email OTP + step-up hook.
6. **Phase 5 — Hardening:** Helmet headers, rate-limit tuning, lockout, rotation
   audit, CSRF audit, Axiom telemetry, cross-tab sign-out, a11y, reduced motion,
   security tests.

Each phase ends green (typecheck + lint + tests + build) before merge.

## 16. Verification

From `web/`:

1. `pnpm -r typecheck`
2. `pnpm -r lint`
3. `pnpm -r test` — Vitest suites:
   - `auth/password.test.ts` (round-trip, timing-safe mismatch)
   - `auth/session.test.ts` (rotate, revoke, expiry, superseded detection, family)
   - `auth/csrf.test.ts`
   - `auth/totp.test.ts`, `auth/recovery.test.ts`, `auth/otp.test.ts`
   - `contracts/auth.test.ts`
   - `SignInModal` render + `AuthContext` restore + "remember me" policy (RTL)
4. `pnpm build`
5. Manual: account → sign up → sign in → reload → rotation on refresh →
   forgot-password → 2FA (TOTP + email) → recovery → "remember me" 7-day vs
   90-day → sign-out; confirm theme toggle still animates; no raw-SQL leak.

## 17. Open Questions (decision needed)

- **Mailer**: is a real mailer in v1 scope, or dev auto-verify + production
  email a later slice?
- **Rotation cadence**: rotate on _every_ request (simplest, safest) vs a
  periodic `/auth/refresh` — pick for latency vs security balance.
- **TOTP at rest**: encrypted (`AUTH_ENCRYPTION_KEY`) vs hash-only + regenerate
  on enrollment change.
- **Remember-me cap**: 90 days acceptable, or shorter/longer?
- **OAuth redirect base** in dev vs prod; is OAuth launch-blockable?
- Whether email verification is enforced before `login` in v1.

## 18. Security checklist (review gate before merge)

- Passwords: argon2id, per-user salt, pepper, constant-time; never logged/echoed.
- Cookies: `httpOnly`, `Secure`, `SameSite=Lax`, `__Host-` on HTTPS.
- Rotation: on login, on 2FA, on schedule, on refresh; superseded ⇒ family revoke.
- Remember-me: changes only lifespan, never disables rotation; idle timeout.
- CSRF: SameSite + double-submit token on non-GET; `state` signed/single-use; PKCE.
- Rate limits: per-account lockout + per-IP + per-code; reuse existing primitives.
- No enumeration: generic auth errors; forgot-password always 200.
- Secrets: env-only, never `VITE_*`, never git, never logs
  (`requestLogger` masks cookie/`authorization`).
- Headers: Helmet (HSTS, CSP, nosniff, frame-deny, referrer-policy).
- Axiom redaction: auth telemetry never includes credential material.
- MCP tool path untouched: account data never routed through raw-SQL tools.

## 19. Auth security threat matrix (summary)

| Threat                      | Mitigation                                                    |
| --------------------------- | ------------------------------------------------------------- |
| Password leak / brute force | argon2id + per-account lockout + per-IP limit                 |
| XSS → token theft           | httpOnly cookie; no token in JS                               |
| CSRF on login/logout/2FA    | SameSite + double-submit CSRF token                           |
| Session hijack / replay     | short-lived tokens + unconditional rotation + family on reuse |
| Stolen-and-held cookie      | rotation windows + reuse-detection alert + "revoke all"       |
| User enumeration            | uniform errors + generic reset response                       |
| Reset-token replay          | SHA-256 at rest, single-use, TTL 30m, constant-time           |
| OTP brute force             | short TTL, single-use, per-IP + per-account throttle          |
| Account takeover in         | step-up on sensitive actions + abnormal-context probe         |

## 20. Extensibility (identity provider interface)

```ts
interface IdentityProvider {
  name: string;
  start(state: string, challenge: string): Promise<string>;
  callback(
    params: Record<string, string>,
  ): Promise<{ email: string; verified: boolean; providerId: string }>;
}
```

Passkeys/WebAuthn, magic-link, and enterprise SSO later implement the same
interface and reuse session/2FA/protection without branching.

---

_This document is a design for the upcoming feature. Implementation starts on a
short-lived branch and must pass the verifier gate before merging. No comments
in code; extend this doc as decisions resolve._
