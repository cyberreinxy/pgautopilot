---
name: pgautopilot
description: >-
  Use this skill for ANY PostgreSQL database work through the PGAutoPilot MCP server.
  **Trigger when user asks to:**
  - Explore, query, or manage a PostgreSQL database
  - Design schemas, tables, or data models for Postgres
  - Write, optimize, or debug SQL queries
  - Check database health, performance, or connectivity
  - Insert, update, upsert, or delete data
  - Back up a database
  - Work with multiple databases
  - Understand table structure, indexes, constraints, or relationships
  - Count, aggregate, or analyze data
  **Keywords:** PostgreSQL, Postgres, SQL, database, table, query, schema, index, constraint, migration, backup, PGAutoPilot, MCP
metadata:
  author: cyberreinxy
  version: "2.3.0"
---

# PGAutoPilot — PostgreSQL AI Assistant

PGAutoPilot is an MCP server that lets you safely interact with any PostgreSQL database through natural language. It provides 18 tools for reading, writing, analyzing, and maintaining databases.

## Core Principles

1. **Always start with exploration.** Before writing queries, call `db_overview` to understand what tables exist and how they relate. Then use `db_schema` for column-level detail.

2. **Use structured tools first.** Prefer `db_find_many`, `db_aggregate`, `db_count` over `db_raw_query`. Structured tools are schema-validated, safe, and produce better results.

3. **Validate before writing.** Use `dryRun: true` on every write tool (`db_create`, `db_update_many`, `db_delete_many`) to preview changes before committing.

4. **Respect safety boundaries.** The server enforces read-only mode, blocked tables, sensitive column redaction, and confirmation gates. These are features, not bugs.

## Available Tools

### Read Tools
| Tool | When to Use |
|------|------------|
| `db_overview` | "What's in this database?" — tables, row counts, relationships |
| `db_schema` | "What columns does each table have?" — full column/type/constraint map |
| `db_health` | "Is the connection working?" — pool stats, vacuum, replication, indexes |
| `db_table_info` | "Tell me about the orders table" — columns, indexes, size |
| `db_find_many` | "Show recent orders" — filtered, sorted, paginated rows |
| `db_find_first` | "Get user with ID 42" — single matching row |
| `db_count` | "How many users signed up this week?" — exact row count |
| `db_aggregate` | "Total sales by category" — grouped aggregates |
| `db_explain` | "Why is this query slow?" — EXPLAIN ANALYZE with analysis |
| `db_raw_query` | "I need a custom SELECT" — escape hatch for complex SQL |

### Write Tools
| Tool | When to Use | Safety |
|------|------------|--------|
| `db_create` | "Add a new user" | Schema-validated, sensitive columns stripped |
| `db_upsert` | "Create or update this product" | Conflict-safe, unique constraint required |
| `db_update_many` | "Update all shipped orders" | Warns on >10 rows, confirmAll for all |
| `db_delete_many` | "Delete old logs" | Warns on >10 rows, confirmAll for all |

### Maintenance Tools
| Tool | When to Use |
|------|------------|
| `db_backup` | "Back up the database" — full SQL dump |

## Query Patterns

### Filtering with `db_find_many`
The `where` parameter accepts a JSON filter object:
```
db_find_many(table="orders", where={"status": "active", "total": {"gt": 100}})
```

Operators: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, `startsWith`, `endsWith`, `in`, `notIn`

### Aggregation with `db_aggregate`
```
db_aggregate(table="orders", by="status", _count="*", _sum="total", orderBy={"_count": "desc"})
```

Available aggregates: `_count`, `_sum`, `_avg`, `_min`, `_max`

### Pagination
```
db_find_many(table="users", take=20, skip=40)  # page 3, 20 per page
```

## Common Mistakes to Avoid

- **Don't use `db_raw_query` for simple queries.** Use `db_find_many` or `db_aggregate` instead — they're safer and schema-validated.
- **Don't skip `dryRun`.** Always preview writes before committing.
- **Don't ignore `db_health`.** Check health at the start of a session to catch connection issues early.
- **Don't assume table names.** Always use `db_overview` first to discover the actual schema.
