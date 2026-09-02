---
name: query-optimization
description: >-
  Use this skill when analyzing, optimizing, or debugging PostgreSQL query performance.
  **Trigger when user asks to:**
  - "Why is this query slow?"
  - "Help me optimize this query"
  - "What indexes would improve performance?"
  - "Analyze the execution plan"
  - "Find slow queries"
  - "Tune database performance"
  - "My app is slow"
  - Explain plans, EXPLAIN ANALYZE, sequential scans, index suggestions
  **Keywords:** slow query, performance, EXPLAIN, ANALYZE, execution plan, index, optimization, bottleneck, latency, sequential scan, hash join, sort, cost
metadata:
  author: cyberreinxy
  version: "2.4.0"
---

# Query Optimization with PGAutoPilot

PGAutoPilot provides `db_explain` for analyzing query execution plans and identifying optimization opportunities.

## Workflow

### 1. Get the Execution Plan
Call `db_explain` with the query to analyze:
```
db_explain(query="SELECT u.name, COUNT(o.id) FROM users u JOIN orders o ON o.user_id = u.id WHERE o.created_at > '2025-01-01' GROUP BY u.name ORDER BY COUNT(o.id) DESC LIMIT 10")
```

This returns:
- **Plan**: Full JSON execution plan from PostgreSQL
- **Summary**: Timing, cost, rows, buffer usage
- **Analysis**: Auto-detected issues with recommendations

### 2. Check Table Indexes
If the plan shows sequential scans, check what indexes exist:
```
db_table_info(table="orders")
```

Look at the `indexes` array to see what's already indexed.

### 3. Understand the Schema
For complex queries, verify column types and relationships:
```
db_schema()
```

### 4. Suggest Fixes
Based on the analysis, recommend:
- **Indexes to add**: columns used in WHERE, JOIN, ORDER BY
- **Query rewrites**: replace OR with UNION, avoid SELECT *, etc.
- **Configuration changes**: work_mem for sorts, shared_buffers for cache

## Common Issues and Fixes

### Sequential Scan on Large Table
**Symptom**: `db_explain` reports "Sequential scan removes X rows"
**Fix**: Add an index on the filtered column:
```sql
CREATE INDEX idx_orders_status ON orders(status);
```

### Low Buffer Cache Hit Rate
**Symptom**: `db_explain` reports hit rate below 90%
**Fix**: Increase `shared_buffers` in postgresql.conf, or check for table bloat

### External Sort
**Symptom**: `db_explain` reports "External sort detected"
**Fix**: Add an index to avoid the sort, or increase `work_mem`

### High-Cost Hash Join
**Symptom**: `db_explain` reports hash join with high cost
**Fix**: Ensure join columns are indexed on both tables

## Using `db_raw_query` for Advanced Analysis

For deeper analysis, use `db_raw_query` with system views:
```sql
-- Find tables with missing indexes (large tables with seq scans)
SELECT schemaname, relname, seq_scan, seq_tup_read
FROM pg_stat_user_tables
WHERE seq_scan > 100 AND seq_tup_read > 10000
ORDER BY seq_tup_read DESC
LIMIT 10
```

```sql
-- Find unused indexes
SELECT schemaname, relname, indexrelname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0 AND indexrelname NOT LIKE '%_pkey'
ORDER BY pg_relation_size(indexrelid) DESC
```
