# PostgreSQL Playground Feature — Implementation Plan

This document is the complete, standalone specification for the playground
feature. It contains the goal, the architecture, the reasoning behind every
decision, exact SQL and code structure, and a step-by-step build order. It is
written to be actionable directly — by a human developer or an AI coding
agent — without needing any other document for context.

---

## 1. What we're building

When a user opens the application for the first time, they should not have to
configure a database before they can use the product. Instead, the app gives
them a fully working PostgreSQL environment automatically — same schema, same
realistic sample data as every other new user — that they can explore and
modify freely.

Inside that environment, the user can do anything a normal database user can
do: create tables, alter schemas, insert/update/delete data, drop tables, run
any query. Nothing is precious. At any point they can press a **Reset
Playground** button and instantly get back the exact original state — same
schema, same data, same indexes, same constraints — as if it were brand new.

Whenever the app is running on this built-in environment, the UI shows a
**Playground** badge so the user always knows they're looking at sample data,
not something real. When the user is ready, they open connection settings,
enter their own PostgreSQL connection string, and the app switches to using
their real database instead — no restart, no reconfiguration elsewhere.

### Why this is worth building carefully

The value of this feature is that a brand-new user can experience the full
product in under a minute, with zero setup, and without any fear of breaking
something. That promise only holds if two things are both true at once:
resets are fast regardless of how much the user did, and one user's
playground can never affect another user's playground or the product's real
infrastructure. Everything below is built around guaranteeing those two
things.

---

## 2. Architecture overview

One PostgreSQL database, with many **schemas** inside it:

- `template` — the canonical, read-only source of truth: schema definitions,
  indexes, constraints, foreign keys, sequences, views, functions, triggers,
  and realistic sample data. Nothing ever writes to this schema except a
  deployment/migration process.
- `playground_<id>` — one schema per active playground, created as a copy of
  `template` when a user first needs one.

All playgrounds live in the same database instance, sharing one connection
pool. A request is routed to the correct playground by switching Postgres
session settings (`search_path` and `ROLE`) at the moment a connection is
checked out from the pool — the rest of the application code never needs to
know which playground it's talking to.

```
                     ┌─────────────────────┐
                     │   Application code   │
                     │  (queries as usual)  │
                     └──────────┬──────────┘
                                │
                     ┌──────────▼──────────┐
                     │  Connection Manager   │
                     │  decides: playground  │
                     │  or user's own DB?    │
                     └──────────┬──────────┘
                                │
           ┌───────────────────┼────────────────────┐
           │                                          │
           ▼                                          ▼
  ┌─────────────────┐                     ┌───────────────────────┐
  │  Shared Pool      │                     │  User's own PostgreSQL │
  │  (this app's DB)   │                    │  (their connection      │
  │                    │                    │   string)                │
  │  schema: template  │                    └───────────────────────┘
  │  schema: playground_a
  │  schema: playground_b
  │  schema: playground_c
  └─────────────────┘
```

### Why schema-per-user, not database-per-user or container-per-user

There are three ways to give each user an isolated Postgres sandbox:
one database per user, one schema per user (in a shared database), or one
container/instance per user. We're using schema-per-user. The reasoning,
stated plainly so it survives even if someone revisits this later:

- **Container-per-user** gives the strongest isolation but solves a problem
  we don't have. A demo playground holds no real user data, so there's
  nothing sensitive to isolate at the infrastructure level. Paying for
  container orchestration, provisioning latency, and ops overhead buys
  isolation strength we don't need.
- **Database-per-user** gives strong isolation natively (Postgres won't let
  you query across databases without extra extensions) and has a very fast
  built-in reset primitive (`CREATE DATABASE ... TEMPLATE`, a filesystem-level
  copy). Its weakness is connections: each database needs its own connection
  pool, and Postgres has a hard ceiling on total connections
  (`max_connections`). With many concurrent playgrounds, that means a pool
  per playground, which doesn't scale.
- **Schema-per-user** lets every playground share a single connection pool —
  a checkout just runs `SET search_path` and `SET ROLE` for that session.
  This is what makes it scale to many concurrent users without hitting
  connection limits. The tradeoff is that schema isolation is not automatic
  the way database isolation is — it has to be explicitly enforced with
  Postgres grants, which is covered in detail in §5.

If the product later needs to scale past what one Postgres instance's schema
count and pool can comfortably handle, multiple playground clusters can sit
behind the same Connection Manager (see §13), so this decision doesn't box us
in long-term.

---

## 3. Connection Manager

This is the single place in the codebase that decides which database a
request talks to. No other module should read a database URL or connection
config directly — everything goes through this.

**Responsibility:**

```
getConnection(sessionId):
  if session has a user-configured connection string:
      return a connection to that string, used as-is
  else:
      checkout a connection from the shared playground pool
      run: SET search_path = playground_<id>
      run: SET ROLE playground_<id>_role
      return that connection
```

Two important rules:

- `search_path` and `ROLE` are set by the server, from a value looked up
  server-side against the session's stored playground ID (§7). They are never
  taken from client-supplied input, to prevent a user from spoofing another
  playground's identifier.
- If a user has configured their own connection string, the playground layer
  is bypassed entirely for that session — no `search_path` switching, no
  playground role involved.

---

## 4. Provisioning a new playground

Triggered the first time a session needs a database and has no user-configured
connection string.

```
1. Generate a unique id for the playground (e.g. a UUID), call it <id>.
2. Create a dedicated Postgres role for this playground:
     CREATE ROLE playground_<id>_role NOLOGIN;
   (NOLOGIN because the app connects as a pooled service role and switches
   into this role per-session via SET ROLE — it does not need its own
   password/login credentials.)
3. Create the schema, owned by that role:
     CREATE SCHEMA playground_<id> AUTHORIZATION playground_<id>_role;
4. Lock down default visibility (details in §5):
     REVOKE ALL ON SCHEMA playground_<id> FROM PUBLIC;
5. Copy every table (and its indexes, constraints, defaults) from `template`
   into the new schema, then copy the data. Exact statements in §6 — this is
   the same routine reset uses, since provisioning and resetting are the same
   operation performed on a schema that doesn't exist yet vs. one that does.
6. Record the new playground in the metadata table (§7).
7. Return usingPlayground: true to the client, along with whatever session
   token the app already uses.
```

---

## 5. Isolation — why it needs explicit enforcement, and exactly how

This is the part most likely to be gotten wrong, so it gets its own section.

`search_path` only changes how _unqualified_ table names resolve for a
session (e.g. `SELECT * FROM users` looks in whatever schemas are on the
path). It does **not** stop anyone from writing a fully-qualified query like
`SELECT * FROM playground_someone_elses_id.users` — that will succeed unless
permissions explicitly forbid it. Relying on `search_path` alone is not
isolation, it's just convenience routing. Real isolation comes from Postgres
grants:

```sql
-- On creation of playground_<id>:
CREATE ROLE playground_<id>_role NOLOGIN;
CREATE SCHEMA playground_<id> AUTHORIZATION playground_<id>_role;
REVOKE ALL ON SCHEMA playground_<id> FROM PUBLIC;
GRANT ALL ON SCHEMA playground_<id> TO playground_<id>_role;
GRANT ALL ON ALL TABLES IN SCHEMA playground_<id> TO playground_<id>_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA playground_<id>
  GRANT ALL ON TABLES TO playground_<id>_role;
```

Because `REVOKE ALL ... FROM PUBLIC` is run for every schema, and no grant is
ever made from `playground_<id>_role` to any other schema (including
`template` and every other playground), a fully-qualified cross-schema query
from inside a playground session fails with a permission error — not just
"table not found." This must hold for every playground and for `template`
itself; `template` should never grant anything to any playground role.

Additional lockdown on the playground role itself, so "the user can do
anything" stays bounded to _their own schema's contents_, not the server:

- No `CREATEDB`, `CREATEROLE`, or superuser attributes on
  `playground_<id>_role`.
- No ability to connect directly (`NOLOGIN`) — access only happens through the
  app's pooled connection via `SET ROLE`.
- Deny statements that reach outside a schema's contents regardless of role
  privileges where possible: `ALTER SYSTEM`, `COPY ... PROGRAM`,
  `CREATE EXTENSION` (unless a specific extension is explicitly needed by the
  template and pre-installed by an admin).
- Set a `statement_timeout` and a reasonable `work_mem` cap at the role or
  session level to prevent one playground from degrading performance for
  everyone sharing the instance.

**Verification step (don't skip this):** before shipping, manually attempt,
from inside one playground's session, to (a) query another playground's
schema by fully-qualified name, (b) query `template` directly, (c) run
`CREATE ROLE` or `ALTER SYSTEM`. All three must fail. This is the concrete
test that isolation is actually enforced, not just assumed.

---

## 6. Reset — how a playground goes back to its original state

Reset must be **fast regardless of how much data the demo dataset contains**,
because the plan is for the template to include a realistic, sizeable
dataset (see §10). This rules out replaying a full SQL script line-by-line
(that scales with data volume) in favor of a set-based bulk copy.

```sql
-- Step 1: end any in-flight sessions using this playground's role,
-- so the schema can be safely dropped.
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE usename = 'playground_<id>_role' AND pid <> pg_backend_pid();

-- Step 2: drop everything currently in the schema.
DROP SCHEMA IF EXISTS playground_<id> CASCADE;

-- Step 3: recreate the schema with the same locked-down grants as provisioning
-- (repeat the CREATE SCHEMA / REVOKE / GRANT block from §5).

-- Step 4: for every table in `template`, in dependency order (or with
-- constraints deferred), recreate structure and copy data:
CREATE TABLE playground_<id>.<table_name>
  (LIKE template.<table_name> INCLUDING ALL);

INSERT INTO playground_<id>.<table_name>
  SELECT * FROM template.<table_name>;

-- Step 5: re-point sequence ownership and foreign keys to the new schema's
-- own objects (INCLUDING ALL copies indexes/defaults/constraints, but
-- foreign keys referencing other tables need to be re-added pointing at
-- playground_<id> tables specifically, not template's).
```

Run the entire reset in a **single transaction**, so that if anything fails
partway through, the playground is left in its previous state rather than a
half-rebuilt one — the user retries, they don't end up worse off than before
they clicked Reset.

This same sequence (minus step 1, since nothing exists yet) is exactly what
provisioning a brand-new playground does — the two operations should share
one implementation.

---

## 7. Metadata

A single table tracks every playground. It doesn't need its own database —
it can live in whichever schema the application's own control data already
lives in, or a small dedicated `app_meta` schema.

```sql
CREATE TABLE playground_metadata (
  session_id        text PRIMARY KEY,
  schema_name        text NOT NULL,
  role_name           text NOT NULL,
  template_version    integer NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  last_active_at       timestamptz NOT NULL DEFAULT now(),
  reset_count           integer NOT NULL DEFAULT 0
);
```

- `last_active_at` is updated on playground queries, throttled (e.g. only
  written if more than 60 seconds have passed since the last update) so this
  doesn't add write load to every single request.
- `template_version` records which version of the template a given
  playground was built from (see §8) — mainly useful for observability and
  for deciding when an old playground is "stale" and due a suggested reset.

---

## 8. Template versioning

The `template` schema will change over time as the demo dataset improves. To
avoid needing a migration path for every existing playground every time that
happens:

- Every reset or provisioning event always copies from whatever `template`
  currently is, and stamps the new `template_version` into
  `playground_metadata`.
- There is no in-place migration of an existing playground's data — a
  playground either matches the current template version or the user resets
  it to get the current one. This keeps the system simple: the template is
  always the single source of truth, and "catching up" is just "reset."

---

## 9. Idle cleanup

A scheduled background job (e.g. every 5 minutes) that:

1. Finds rows in `playground_metadata` where `last_active_at` is older than a
   configured threshold.
2. For each, terminates active sessions, drops the schema, drops the role,
   and deletes the metadata row.

Threshold guidance: too short (e.g. 30 minutes) risks tearing down a
playground while someone's just stepped away mid-evaluation; too long (e.g.
30 days) risks unbounded storage/schema-count growth. A starting point of
24–48 hours, tunable via config, balances both — but should be revisited once
there's real usage data.

Also enforce a hard cap on total concurrent playgrounds (config value). Once
reached, new playground requests should be rejected with a clear, user-facing
message rather than silently degrading performance for everyone.

---

## 10. What the template dataset should contain

A rich, realistic dataset makes exploration meaningfully more valuable than a
handful of toy tables. The template schema should include a mix such as:

- E-commerce data: products, customers, orders, payments.
- Content data: blog posts, comments, tags.
- HR data: employees, departments.
- Analytics/event data, including time-series patterns.
- A variety of PostgreSQL feature usage so the product's full capability is
  demonstrable: JSONB columns, arrays, UUID primary keys, foreign keys with
  cascading deletes, generated columns, materialized views, triggers,
  full-text search indexes, recursive relationships, and examples that
  support window function queries.

This lives in source control as a normal migration + seed script, applied to
the `template` schema — never hand-edited directly in the database.

---

## 11. Switching between playground and a user's own database

- **Connecting a real database:** user enters host/port/database/username/
  password (or a full connection string) in settings. On successful
  validation, the app stores it for that session/account and the Connection
  Manager starts routing to it immediately — no restart. The playground
  schema is _not_ torn down at this point; it's simply no longer in use, and
  becomes eligible for idle cleanup like any other inactive playground.
- **Disconnecting / returning to the playground:** if the user removes their
  configured connection, the app routes back to their existing playground
  schema if it still exists (not yet cleaned up), preserving whatever state
  it was in — or provisions a fresh one if it was already reclaimed.

---

## 12. Frontend requirements

- **Playground badge/banner** — rendered whenever the bootstrap/session
  response indicates `usingPlayground: true`. Something like: _"You're
  working with sample data. Changes only affect your personal playground."_
  Hidden automatically the moment a real connection is active.
- **Reset Playground button** — calls the reset endpoint, shows a brief
  loading state (reset should complete in low single digit seconds
  regardless of dataset size, per §6), then triggers whatever data-refetch
  the app already performs on a connection change.
- **Connection settings screen** — form for host/port/database/user/password
  or a raw connection string; on save, triggers the switch described in §11.
- **Disconnect / return-to-playground control** — as described in §11.

---

## 13. Scaling beyond one instance (only if needed)

If schema count or shared-pool load on a single Postgres instance ever
becomes the bottleneck, the Connection Manager can be extended to route new
playgrounds across multiple playground-dedicated Postgres instances/clusters,
assigning each new session to one based on load, while existing sessions keep
using whichever instance they were assigned to. This does not require
changing anything else in this document — it's an extension of §3, not a
redesign.

---

## 14. Security checklist (bounding "the user can do anything")

Before shipping, confirm every item:

- [ ] Playground role has no `CREATEDB`, `CREATEROLE`, or superuser attribute.
- [ ] Playground role is `NOLOGIN` — only reachable via the app's pooled
      connection and `SET ROLE`.
- [ ] `REVOKE ALL ... FROM PUBLIC` has been run on every schema, including
      `template` and every playground schema.
- [ ] No grant exists from any playground role to any other schema.
- [ ] `template` schema has zero grants to any playground role — read or
      write.
- [ ] `ALTER SYSTEM`, `COPY ... PROGRAM`, and unapproved
      `CREATE EXTENSION` are blocked.
- [ ] `statement_timeout` and a `work_mem` ceiling are set for playground
      sessions.
- [ ] Manually verified: a playground session cannot read another
      playground's schema by fully-qualified name.
- [ ] Manually verified: a playground session cannot read `template`
      directly.
- [ ] Manually verified: `CREATE ROLE` and `ALTER SYSTEM` fail from within a
      playground session.

---

## 15. Build order

1. **Template schema.** Write the migration + seed script, apply it as
   `template`. Confirm it contains the breadth described in §10.
2. **Provisioning + reset routine.** Implement the shared logic from §4 and
   §6 (they're the same operation). Confirm it runs in a single transaction
   and completes quickly regardless of dataset size.
3. **Isolation lockdown.** Implement the grants from §5. Run the manual
   verification steps from §14 before moving on — do not defer this.
4. **Metadata table.** Implement `playground_metadata` and the throttled
   `last_active_at` update.
5. **Connection Manager.** Implement routing between playground and
   user-configured connections, including `search_path`/`ROLE` switching on
   checkout.
6. **API endpoints.** An init endpoint (provision-if-needed, return
   `usingPlayground`), a reset endpoint, and the existing "save connection
   settings" endpoint updated to flip `usingPlayground` off.
7. **Frontend.** Badge, reset button, connection settings, disconnect/return
   flow — as described in §12.
8. **Idle cleanup job.** Implement the reaper from §9, plus the concurrent-
   playground cap.
9. **Load and adversarial testing.** Reset performance under concurrent load;
   deliberately hostile playground sessions attempting everything in the
   §14 checklist, confirming each is rejected.

---

## 16. Open questions to resolve before or during implementation

- Session identity model: anonymous browser session token, or tied to a user
  account if the app has sign-in before database configuration?
- Exact idle-cleanup threshold — start with the 24–48 hour range from §9 and
  tune with real usage data.
- Concurrent-playground cap — depends on expected traffic and instance
  sizing; start conservative and raise once resource usage is observed.
- Seed dataset size — large enough to be genuinely worth exploring, but
  mindful that more tables/rows means more schema objects to copy per
  provision/reset (reset time is not tied to row count the way a script
  replay would be, but it is still bounded by how many tables/objects exist).
