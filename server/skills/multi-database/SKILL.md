---
name: multi-database
description: >-
  Use this skill when working with multiple PostgreSQL databases through PGAutoPilot.
  **Trigger when user asks to:**
  - "Switch to the analytics database"
  - "List all databases"
  - "Query the staging database"
  - "What databases are connected?"
  - "Compare data between production and staging"
  - "Health check all databases"
  - Multi-database, database switching, cross-database queries
  **Keywords:** multi-database, database, switch, list, staging, production, analytics, cross-database, connection, pgautopilot.json
metadata:
  author: cyberreinxy
  version: "2.4.0"
---

# Multi-Database with PGAutoPilot

PGAutoPilot can connect to multiple PostgreSQL databases simultaneously. Each database can have its own safety rules, schemas, and configuration.

## Setup

Create `pgautopilot.json` in your project root:

```json
{
  "defaults": {
    "readonly": true,
    "schemas": ["public"],
    "statement_timeout_ms": 10000,
    "pool_max": 5
  },
  "databases": {
    "app_production": {
      "url": "$APP_DATABASE_URL",
      "readonly": false,
      "blocked_tables": ["schema_migrations"]
    },
    "analytics": {
      "url": "$ANALYTICS_DATABASE_URL",
      "readonly": true,
      "schemas": ["public", "reporting"]
    },
    "staging": {
      "url": "$STAGING_DATABASE_URL",
      "readonly": false
    }
  }
}
```

All URLs support `$VAR` and `${VAR}` environment variable interpolation.

## Tools

### `db_list_databases` — Discover Available Databases
```
db_list_databases()
```

Returns all configured databases with connection status, host, and read-only setting.

### `db_use_database` — Switch the Default
```
db_use_database(database="analytics")
```

After switching, all tools without an explicit `database` parameter use this database.

### `db_health` — Check All or One Database
```
db_health()                    # Check all databases
db_health(database="staging")  # Check specific database
```

### Any Tool — Target a Specific Database
```
db_find_many(table="orders", database="analytics", where={"status": "active"})
db_schema(database="staging")
db_explain(query="SELECT ...", database="app_production")
```

The `database` parameter is optional on every tool — omit it to use the current default.

## Priority Chain

Per-database settings override defaults:

1. **Per-DB `readonly`** in JSON → highest priority
2. **`defaults.readonly`** in JSON → if explicitly set
3. **`ALLOW_WRITES`** env / `--readonly` flag → if JSON doesn't set defaults.readonly
4. **Hardcoded `true`** → fallback

## Common Patterns

### Development vs Production
```json
{
  "databases": {
    "dev": { "url": "$DEV_DATABASE_URL", "readonly": false },
    "prod": { "url": "$PROD_DATABASE_URL", "readonly": true }
  }
}
```

### Read Replicas
```json
{
  "databases": {
    "primary": { "url": "$PRIMARY_URL", "readonly": false },
    "replica": { "url": "$REPLICA_URL", "readonly": true }
  }
}
```

### Multiple Services
```json
{
  "databases": {
    "users_db": { "url": "$USERS_DB_URL" },
    "orders_db": { "url": "$ORDERS_DB_URL" },
    "analytics_db": { "url": "$ANALYTICS_DB_URL", "readonly": true }
  }
}
```

## CLI Flag

Set the default database at startup:
```bash
pgautopilot --database=analytics
```

## Hot Reload

Edit `pgautopilot.json` while the server is running — new databases are added automatically without restart. Removals are logged but pools stay alive until shutdown.
