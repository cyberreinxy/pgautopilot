export class SafeQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SafeQueryError";
  }
}

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

function errorCode(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function withDetail(err: unknown, includeDetail: boolean, base: string): string {
  if (!includeDetail) return base;
  const detail = (err as { detail?: unknown }).detail;
  return typeof detail === "string" && detail.length > 0 ? `${base} (${detail})` : base;
}

function namedPart(err: unknown, key: "column" | "table"): string | null {
  if (!err || typeof err !== "object") return null;
  const value = (err as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function quotedNames(text: string, label: string): string[] {
  const pattern = new RegExp(`${label} "([^"]+)"`, "g");
  const names: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const name = match[1];
    if (name && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

function errText(err: unknown): string {
  if (!err || typeof err !== "object") return "";
  const msg = (err as { message?: unknown }).message;
  const detail = (err as { detail?: unknown }).detail;
  return [typeof msg === "string" ? msg : "", typeof detail === "string" ? detail : ""].join(" ");
}

export function relationNameFromError(err: unknown): string | null {
  const names = quotedNames(errText(err), "relation");
  return names[0] ?? null;
}

export function friendlyDbError(err: unknown, includeDetail = false): string | null {
  const code = errorCode(err);
  if (!code) return null;
  switch (code) {
    case "ECONNREFUSED":
      return "Can't connect to the database. The database server is refusing connections — make sure it's running and reachable.";
    case "ENOTFOUND":
      return "Database host not found. Check the host in DATABASE_URL.";
    case "ETIMEDOUT":
      return "Database connection timed out. Check that the host and port are reachable from this server.";
    case "EACCES":
      return "Permission denied while connecting to the database. Check the database user's permissions.";
    case "ECONNRESET":
    case "EPIPE":
      return "The database connection was lost. The server may have restarted or closed idle connections — try again.";
    case "28P01":
      return "Database authentication failed. Check the username and password in DATABASE_URL.";
    case "28000":
      return "Database authorization failed. Check the credentials in DATABASE_URL.";
    case "3D000":
      return "The database doesn't exist. Check the database name in DATABASE_URL.";
    case "57P03":
      return "The database can't accept connections yet — it may still be starting up. Try again in a moment.";
    case "53300":
      return "Too many connections to the database. Close other sessions or ask an admin to raise max_connections.";
    case "57014":
      return "The query was canceled because it took too long. Try a smaller request.";
    case "23505":
      return withDetail(err, includeDetail, "A record with that unique value already exists.");
    case "23503":
      return withDetail(err, includeDetail, "This change references a record that doesn't exist.");
    case "23502":
      return withDetail(err, includeDetail, "A required value is missing.");
    case "22001":
      return withDetail(err, includeDetail, "A value is too long for its column.");
    case "42703": {
      const column = namedPart(err, "column");
      const table = namedPart(err, "table");
      const text = errText(err);
      const textTables = quotedNames(text, "relation");
      const textColumns = quotedNames(text, "column");
      const tableName = table ?? (textTables.length === 1 ? textTables[0] : null);
      if (column && tableName) {
        return `Column "${column}" doesn't exist on table "${tableName}".`;
      }
      if (column) {
        const otherColumns = textColumns.filter((name) => name !== column);
        if (otherColumns.length > 0) {
          const listed = otherColumns.map((name) => `"${name}"`).join(", ");
          return `Column "${column}" doesn't exist. Other columns in the error: ${listed}.`;
        }
        return `Column "${column}" doesn't exist.`;
      }
      if (table) return `A column referenced doesn't exist on table "${table}".`;
      if (textTables.length === 1 && textColumns.length > 0) {
        return `Column${textColumns.length > 1 ? "s" : ""} ${textColumns
          .map((name) => `"${name}"`)
          .join(
            ", ",
          )} ${textColumns.length > 1 ? "don't" : "doesn't"} exist on table "${textTables[0]}".`;
      }
      return withDetail(err, includeDetail, "That column doesn't exist on this table.");
    }
    case "42P01": {
      const table = namedPart(err, "table");
      if (table) return `Table "${table}" doesn't exist in the database.`;
      return withDetail(err, includeDetail, "That table doesn't exist in the database.");
    }
    case "42P07":
      return withDetail(err, includeDetail, "That table already exists.");
    case "42601":
      return withDetail(err, includeDetail, "The SQL statement has a syntax error.");
    default:
      return null;
  }
}
