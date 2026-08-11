# Database Migrations — NorthStar Dynamics Test Dataset

The canonical test database for the PGAutoPilot dashboard. Always use these two
files (in order) when setting up a database for manual testing, demoing, or
developing against the schema explorer / tables / SQL-editor features.

## Files

| File                     | Version | Purpose                                                                                                                                                          |
| ------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `001_initial_schema.sql` | 1       | Drops all data tables (`DROP TABLE ... CASCADE`), then recreates tables, indexes, triggers, and the `set_updated_at()` helper. Safe to re-run for a clean slate. |
| `002_seed_demo_data.sql` | 2       | Seeds a realistic multi-region dataset for the fictional company **NorthStar Dynamics**. Not idempotent — re-running violates unique constraints.                |

Migration files follow the `NNN_name.sql` naming convention and are tracked in
the `schema_migrations` table (`version`, `name`, `applied_at`), which the
dashboard reads to decide which migrations are pending.

## Requirements

- PostgreSQL 12+ (uses UUIDs, `JSONB`, `GIN` indexes, `plpgsql` triggers, and
  regex `CHECK` constraints — all stock PostgreSQL).

## Applying

### Option A — `psql`

From this directory, in version order:

```bash
psql "$DATABASE_URL" -f 001_initial_schema.sql
psql "$DATABASE_URL" -f 002_seed_demo_data.sql
```

Or a single pass against a fresh database:

```bash
psql "$DATABASE_URL" -f 001_initial_schema.sql -f 002_seed_demo_data.sql
```

### Option B — Dashboard API

Start the dashboard API and use the migrations endpoints (the API refuses to
apply when the server is in read-only mode):

```bash
curl -X POST http://localhost:3000/api/migrations/apply
```

Endpoints:

| Method | Path                             | Behavior                                |
| ------ | -------------------------------- | --------------------------------------- |
| `GET`  | `/api/migrations`                | List all migrations with applied status |
| `POST` | `/api/migrations/apply`          | Apply all pending migrations in order   |
| `POST` | `/api/migrations/apply-selected` | Apply a chosen subset                   |
| `POST` | `/api/migrations/apply/:version` | Apply a single migration by version     |

### Full reset (drop + reseed)

`001` drops every data table (`DROP TABLE ... CASCADE`) before recreating it,
so re-running the files yields a clean, freshly-seeded database:

```bash
psql "$DATABASE_URL" -f 001_initial_schema.sql -f 002_seed_demo_data.sql
```

When using the dashboard API runner, applied migrations are tracked in
`schema_migrations` and skipped on re-apply. To force a full reset through the
API, drop that tracking table first (it is intentionally **not** dropped by
`001`, so the runner's bookkeeping stays consistent):

```bash
psql "$DATABASE_URL" -c "DROP TABLE IF EXISTS schema_migrations CASCADE"
curl -X POST http://localhost:3000/api/migrations/apply
```

## Dataset Overview

| Table           | Rows | Notes                                                       |
| --------------- | ---- | ----------------------------------------------------------- |
| `organizations` | 22   | HQ + regional subsidiaries across the US, EMEA, APAC, LATAM |
| `roles`         | 24   | Permission levels 1–10, system + standard roles             |
| `departments`   | 24   | Includes `head_user_id` wired back to users                 |
| `users`         | 42   | Mix of statuses: active, suspended, on_leave, terminated    |
| `customers`     | 26   | Statuses: active, prospect, inactive, churned               |
| `products`      | 22   | Software + services, USD pricing                            |
| `projects`      | 24   | Delivery engagements tied to customers + PMs                |
| `orders`        | 40   | Sales orders across customers/products                      |
| `invoices`      | 26   | Billing docs in draft/sent/paid/overdue states              |
| `activity_logs` | 60   | Audit trail spanning users/actions                          |

## Constraints to Know When Writing Test Data

- **User emails must end in `@northstardynamics.demo`** — a `CHECK` constraint
  on `users.email` rejects anything else. Customer emails use `.example` domains
  and are not subject to that check.
- **Soft deletes**: every business table has a `deleted_at` column. Prefer
  setting `deleted_at` over hard `DELETE` when testing, and note most partial
  indexes filter on `deleted_at IS NULL`.
- **`departments.head_user_id`** was added with a post-creation `ALTER TABLE`
  to break the circular `departments <-> users` reference; `002` back-fills it
  with `UPDATE` statements.
- **`updated_at` is managed by triggers** (`set_updated_at()` on every table) —
  do not set it manually on `UPDATE`.
- **Unique business keys**: `organizations` (none global), `roles.name`/`code`,
  `departments (organization_id, code)`, `users.email`, `customers.email`,
  `products.sku`, `projects.project_code`, `orders.order_number`,
  `invoices.invoice_number`. Duplicate inserts will fail.

## Reset / Re-run

`002` is not idempotent. To start fresh, drop and recreate the schema, or reset
the applied bookkeeping:

```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
```

Then re-apply both files. The `schema_migrations` bookkeeping table is created
on first apply, so a clean `public` schema is all that is required.

## Verify

```sql
SELECT (SELECT count(*) FROM users)   AS users,
       (SELECT count(*) FROM orders)  AS orders,
       (SELECT count(*) FROM invoices) AS invoices;
```

Expect `users = 42`, `orders = 40`, `invoices = 26`.
