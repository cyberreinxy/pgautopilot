---
name: safe-writes
description: >-
  Use this skill when writing, inserting, updating, or deleting data in PostgreSQL through PGAutoPilot.
  **Trigger when user asks to:**
  - "Add a new user/record/row"
  - "Update orders status"
  - "Delete old logs"
  - "Create or update this product"
  - "Bulk update/delete"
  - Insert, update, upsert, delete, write operations
  **Keywords:** insert, create, update, delete, upsert, write, bulk, batch, dry run, confirm, safe, destructive, backup
metadata:
  author: cyberreinxy
  version: "2.3.0"
---

# Safe Write Patterns with PGAutoPilot

PGAutoPilot provides multiple safety layers for write operations. Always use them.

## Golden Rule: Dry Run First

**Every write tool supports `dryRun: true`.** Always preview before committing.

```
db_create(table="users", data={"name": "Jane", "email": "jane@example.com"}, dryRun=true)
```

If the dry run looks correct, call again without `dryRun` to execute.

## Write Tools

### `db_create` — Insert a Single Row
```
db_create(table="users", data={"name": "Jane Doe", "email": "jane@example.com", "role": "admin"})
```

- Validates column names against live schema
- Strips sensitive columns (passwords, tokens, keys) automatically
- Returns the inserted row with auto-generated values

### `db_upsert` — Insert or Update
```
db_upsert(
  table="products",
  where={"sku": "WIDGET-001"},
  create={"name": "Widget Pro", "price": 29.99, "sku": "WIDGET-001"},
  update={"price": 24.99}
)
```

- `where` columns MUST match a unique constraint or primary key
- If row exists: updates only the `update` columns
- If row doesn't exist: inserts with `create` columns
- Idempotent — safe to call multiple times

### `db_update_many` — Update Multiple Rows
```
db_update_many(table="orders", where={"status": "pending"}, data={"status": "shipped", "shipped_at": "2026-09-01"})
```

- **Warning on >10 rows** — you'll see a count before execution
- **confirmAll required** for empty filter `{}`
- Always use `dryRun: true` first

### `db_delete_many` — Delete Multiple Rows
```
db_delete_many(table="logs", where={"created_at": {"lt": "2025-01-01"}}, dryRun=true)
```

- **Warning on >10 rows**
- **confirmAll required** for empty filter `{}`
- **ALWAYS dry-run first** — deleted data cannot be recovered

## Safety Features### Blocked Tables

Some tables are configured to block all writes. Attempting to write to them returns an error:
```
db_create(table="audit_log", data={...})
// Error: Table "audit_log" is blocked from writes.
```

### High-Risk Tables

Some tables are marked as high-risk — writes trigger a warning but are allowed to proceed:
```
db_create(table="users", data={...})
// Warning: [HIGH-RISK] Table "users" is marked as high-risk.
```

### Sensitive Column Stripping
Columns matching `password`, `token`, `secret`, `api_key`, etc. are automatically stripped from write input:
```
db_create(table="users", data={"name": "Jane", "password": "secret123", "email": "jane@example.com"})
// password is silently removed — the row is inserted without it
```

### Read-Only Mode
If the server is in read-only mode (`--readonly`), all write tools are blocked:
```
db_create(table="users", data={"name": "Jane"})
// Error: Write operations are blocked in read-only mode.
```

## Backup Before Bulk Operations

Before large updates or deletes, create a backup:
```
db_backup(label="pre-bulk-update")
```

This creates a full SQL dump that can be used to restore if something goes wrong.
