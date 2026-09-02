---
name: database-health
description: >-
  Use this skill when checking PostgreSQL database health, monitoring, or diagnosing production issues.
  **Trigger when user asks to:**
  - "Check database health"
  - "Is the database healthy?"
  - "Check vacuum status"
  - "Check replication lag"
  - "Are there unused indexes?"
  - "Check connection pool"
  - "Database monitoring"
  - "Production health check"
  - Vacuum, replication, sequences, indexes, connections, pool stats
  **Keywords:** health, vacuum, replication, lag, sequence, index, connection, pool, uptime, monitoring, production, TXID, wraparound, bloat, dead tuples
metadata:
  author: cyberreinxy
  version: "2.3.0"
---

# Database Health Monitoring with PGAutoPilot

PGAutoPilot's `db_health` tool provides comprehensive health checks beyond basic connectivity.

## Health Checks

### Connectivity & Pool
- **Connection status**: Is the database reachable?
- **Pool stats**: total, idle, waiting connections
- **Uptime**: how long the server has been running
- **Latency**: response time of the last health check

### Vacuum Health
Checks for tables approaching **TXID wraparound** (>100M transactions since last freeze).
- **Why it matters**: TXID wraparound causes PostgreSQL to stop accepting writes
- **Fix**: Run `VACUUM FREEZE` on affected tables, or increase `autovacuum_freeze_max_age`

### Replication Health
Checks for **replica lag** in streaming replication setups.
- **Why it matters**: High lag means replicas serve stale data
- **Fix**: Check network bandwidth, increase `max_wal_senders`, verify replication slots

### Index Health
Finds **unused indexes** (0 scans, non-primary-key).
- **Why it matters**: Unused indexes consume space and slow down writes
- **Fix**: Drop unused indexes after confirming they're not needed for specific queries

### Sequence Health
Finds **sequences nearing max value** (>80% exhausted).
- **Why it matters**: Exhausted sequences cause INSERT failures
- **Fix**: `ALTER SEQUENCE seq RESTART WITH 1` or switch to `BIGINT GENERATED ALWAYS AS IDENTITY`

## Usage

### Single Database
```
db_health()
```

Returns all checks for the connected database.

### Multi-Database
```
db_health()           # Check all databases
db_health(database="analytics")  # Check specific database
```

## Interpreting Results

### All OK
```json
{
  "status": "connected",
  "healthChecks": {
    "vacuum": { "status": "ok" },
    "replication": { "status": "no_replicas" },
    "indexes": { "status": "ok" },
    "sequences": { "status": "ok" }
  }
}
```

### Warning: TXID Wraparound
```json
{
  "vacuum": {
    "warning": "1 table(s) approaching TXID wraparound",
    "tables": [{ "relname": "logs", "xid_age": 150000000 }]
  }
}
```
**Action**: Run `VACUUM FREEZE public.logs;` immediately.

### Warning: Unused Indexes
```json
{
  "indexes": {
    "warning": "3 unused index(es) found",
    "unused": [{ "relname": "orders", "indexrelname": "idx_old_status" }]
  }
}
```
**Action**: Verify the index isn't used by specific queries, then `DROP INDEX idx_old_status;`

### Warning: Sequences Near Max
```json
{
  "sequences": {
    "warning": "1 sequence(s) above 80% of max value",
    "sequences": [{ "sequencename": "users_id_seq", "pct_used": 97.8 }]
  }
}
```
**Action**: `ALTER SEQUENCE users_id_seq RESTART WITH 1;` (or add a new column with BIGINT IDENTITY)
