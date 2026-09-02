---
name: backup-restore
description: >-
  Use this skill when creating, managing, or restoring PostgreSQL backups through PGAutoPilot.
  **Trigger when user asks to:**
  - "Back up the database"
  - "How do I restore from a backup?"
  - "Create a backup before I make changes"
  - "Export the database"
  - "I need to restore my data"
  - Backup, restore, dump, export, import, pg_dump, SQL dump
  **Keywords:** backup, restore, dump, export, import, pg_dump, SQL, snapshot, data loss, recovery, rollback
metadata:
  author: cyberreinxy
  version: "2.4.0"
---

# Backup & Restore with PGAutoPilot

## Creating a Backup

```
db_backup(label="pre-deploy")
```

This creates a full SQL dump file. The `label` parameter adds a human-readable suffix to the filename.

### What's in the backup
- **pg_dump available**: Full schema + data (DDL + DML)
- **pg_dump unavailable**: SQL fallback — data only via `SELECT` queries (no schema)

### Backup location
Backups are saved to the configured `backupDir` (default: `./backups`). The file is named:
```
backup-2026-09-02T16-30-00-pre-deploy.sql
```

### Before bulk operations
Always backup before large updates or deletes:
```
db_backup(label="pre-bulk-update")
```

Then preview the change:
```
db_update_many(table="logs", where={"status": "old"}, data={"status": "archived"}, dryRun=true)
```

If the dry run looks correct, execute without `dryRun`.

## Restoring from a Backup

PGAutoPilot creates SQL dump files that can be restored with `psql`:

```bash
# Restore to the same database
psql "postgresql://user:pass@host:5432/dbname" < backups/backup-2026-09-02T16-30-00-pre-deploy.sql

# Restore to a different database
psql "postgresql://user:pass@host:5432/newdb" < backups/backup-2026-09-02T16-30-00-pre-deploy.sql
```

### If the backup was created with `--clean` (default)
The dump includes `DROP` statements before `CREATE`. This means:
- Existing tables are dropped and recreated
- Data is replaced, not merged

### If you need to merge (not replace)
1. Restore to a temporary database
2. Use `INSERT ... ON CONFLICT` to merge data

## pg_dump vs SQL Fallback

| Feature | pg_dump | SQL Fallback |
|---------|---------|--------------|
| Schema included | Yes | No |
| Data included | Yes | Yes |
| Requires postgresql-client | Yes | No |
| Works in Docker | Yes (via docker exec) | Always |
| Output format | Custom pg_dump format or SQL | Plain SQL |
| Restore command | `pg_restore` or `psql` | `psql` only |

## Backup Strategies

### Pre-deploy backup
```
db_backup(label="pre-deploy-v2.4.0")
```

### Daily automated backup
Set up a cron job or CI step that calls `db_backup(label="daily")`.

### Before schema migration
```
db_backup(label="pre-migration-add-orders-table")
```

## Docker Backup

If `DOCKER_CONTAINER` is set, PGAutoPilot uses `docker exec` to run `pg_dump` inside the container:

```bash
docker exec <container> pg_dump -U postgres -d mydb --clean --if-exists
```

This works even when `pg_dump` isn't installed on the host.

## Verifying Backups

After creating a backup, verify it's valid:
```bash
# Check file size (should be > 0)
ls -la backups/backup-*.sql

# Check it starts with valid SQL
head -20 backups/backup-*.sql

# Test restore to a scratch database
createdb scratch_test
psql scratch_test < backups/backup-*.sql
```
