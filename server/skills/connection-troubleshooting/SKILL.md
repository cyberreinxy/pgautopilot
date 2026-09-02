---
name: connection-troubleshooting
description: >-
  Use this skill when diagnosing PostgreSQL connection issues through PGAutoPilot.
  **Trigger when user asks to:**
  - "I can't connect to the database"
  - "Connection refused"
  - "Connection timed out"
  - "Database is not reachable"
  - "How do I fix my database URL?"
  - "The database won't start"
  - Connection errors, authentication failures, SSL issues, host unreachable
  **Keywords:** connection, connect, refused, timeout, unreachable, URL, hostname, port, SSL, authentication, password, pg_hba, pool, health
metadata:
  author: cyberreinxy
  version: "2.4.0"
---

# Connection Troubleshooting with PGAutoPilot

When a user reports connection issues, follow this diagnostic workflow.

## Step 1: Check Current Status

```
db_health()
```

This tells you:
- **connected** — the pool is working, issue may be intermittent
- **not_connected** — the pool failed to initialize
- **error message** — the specific failure reason

## Step 2: Verify the Connection String

The most common issue is a malformed `DATABASE_URL`. Check the format:

```
postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require
```

Common mistakes:
| Problem | Example | Fix |
|---------|---------|-----|
| Wrong protocol | `mysql://...` or `http://...` | Must be `postgresql://` or `postgres://` |
| Missing port | `postgresql://host/db` | Add `:5432` (or actual port) |
| Special chars in password | `p@ss!word` | URL-encode: `p%40ss!word` |
| Missing database name | `postgresql://host:5432/` | Add database name after `/` |
| SSL required but not specified | Connection refused on cloud DBs | Add `?sslmode=require` |

## Step 3: Test Connectivity

```
db_raw_query(sql="SELECT 1", confirmed=false)
```

If this fails, the issue is at the network/auth level, not the query level.

## Step 4: Check SSL Mode

Cloud databases (Neon, Supabase, RDS, Cloud SQL) require SSL. The `sslmode` parameter controls this:

| sslmode | Behavior | Use when |
|---------|----------|----------|
| `require` | Encrypt, don't verify cert | Most cloud databases |
| `verify-ca` | Encrypt, verify CA | Production with custom CA |
| `disable` | No encryption | Local development only |

Set via `DATABASE_URL`:
```
postgresql://user:pass@host:5432/db?sslmode=require
```

Or via environment variable:
```
export PGSSLMODE=require
```

## Step 5: Check Host and Port

```
db_raw_query(sql="SHOW server_version", confirmed=false)
```

If this works, the connection is fine — the issue was transient.

If it fails with "connection refused":
- **Local**: Is PostgreSQL running? `pg_isready -h localhost -p 5432`
- **Remote**: Is the port open? Check firewall/security group rules
- **Cloud**: Is the database paused? (Neon, Supabase free tier pause after inactivity)

## Step 6: Check Authentication

Common auth errors:
| Error | Cause | Fix |
|-------|-------|-----|
| `password authentication failed` | Wrong password | Verify credentials in dashboard |
| `pg_hba.conf rejects connection` | IP not allowed | Add client IP to allowed list |
| `role does not exist` | Wrong username | Check `SELECT usename FROM pg_user` |
| `database does not exist` | Wrong database name | Check `SELECT datname FROM pg_database` |

## Step 7: Multi-Database Issues

If using `pgautopilot.json` with multiple databases:

1. Check the config file exists in project root
2. Verify each URL is valid (Step 2)
3. Run `db_list_databases()` to see all connection statuses
4. Run `db_health(database="specific_db")` to check a specific database

## Step 8: Pool Exhaustion

If queries hang instead of failing:
- Pool may be exhausted (all connections busy)
- Check `db_health()` — look at `pool.waiting` count
- Fix: increase `pool_max` in config, or reduce query load

## Quick Reference

| Symptom | Most Likely Cause | First Action |
|---------|-------------------|--------------|
| `ECONNREFUSED` | PostgreSQL not running or wrong host/port | Check `pg_isready` |
| `ETIMEDOUT` | Firewall or wrong hostname | Check security groups |
| `password authentication failed` | Wrong credentials | Verify in database dashboard |
| `SSL required` | Missing `sslmode=require` | Add to connection string |
| `role does not exist` | Wrong username | Check database users |
| Queries hang | Pool exhaustion | Check `db_health()` pool stats |
| Works sometimes, fails sometimes | Connection pool timeout | Increase `pool_max` or `statement_timeout_ms` |
