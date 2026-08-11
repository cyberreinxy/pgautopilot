const STRING_RE = /'[^']*'|"[^"]*"|`[^`]*`/g;

const DROP_RE =
  /\bDROP\s+(TABLE|SCHEMA|DATABASE|VIEW|MATERIALIZED\s+VIEW|INDEX|FUNCTION|PROCEDURE|TRIGGER|TYPE|ROLE|USER)\b/i;
const TRUNCATE_RE = /\bTRUNCATE\b/i;
const DELETE_RE = /\bDELETE\s+FROM\b/i;
const UPDATE_RE = /\bUPDATE\b/i;
const WHERE_RE = /\bWHERE\b/i;
const STRUCTURE_RE = /\b(ALTER|REINDEX|VACUUM|GRANT|REVOKE|CLUSTER)\b/i;

const READ_ONLY_START_RE =
  /^(SELECT|WITH|SHOW|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|SET|RESET|VACUUM|ANALYZE|DECLARE)\b/i;

export type SqlRiskKind = "drop" | "truncate" | "bulk-write" | "write" | "structure";

export function classifySqlRisk(sql: string): SqlRiskKind | null {
  const stripped = sql.replace(STRING_RE, "");
  const statements = stripped.split(";");
  let risk: SqlRiskKind | null = null;
  for (const raw of statements) {
    const statement = raw.trim();
    if (!statement) continue;
    if (DROP_RE.test(statement)) return "drop";
    if (TRUNCATE_RE.test(statement)) return "truncate";
    if (DELETE_RE.test(statement) || UPDATE_RE.test(statement)) {
      if (!WHERE_RE.test(statement)) return "bulk-write";
      risk = risk ?? "write";
    } else if (STRUCTURE_RE.test(statement)) {
      risk = risk ?? "structure";
    } else if (!READ_ONLY_START_RE.test(statement)) {
      risk = risk ?? "write";
    }
  }
  return risk;
}

export function riskTitle(kind: SqlRiskKind): string {
  switch (kind) {
    case "drop":
      return "Confirm destructive query";
    case "truncate":
      return "Confirm table truncation";
    case "bulk-write":
      return "Confirm bulk modification";
    case "write":
      return "Confirm write operation";
    case "structure":
      return "Confirm schema change";
  }
}

export function riskWarning(kind: SqlRiskKind): string {
  switch (kind) {
    case "drop":
      return "This permanently removes database objects and cannot be undone.";
    case "truncate":
      return "This deletes every row in the table and cannot be undone.";
    case "bulk-write":
      return "This modifies every row matching the statement with no WHERE filter.";
    case "write":
      return "This writes or modifies data in your database.";
    case "structure":
      return "This changes the database schema or structure.";
  }
}
