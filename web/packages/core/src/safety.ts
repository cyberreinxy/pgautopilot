const DEFAULT_SENSITIVE_COLUMNS = new Set([
  "password",
  "password_hash",
  "passwordhash",
  "token",
  "reset_token",
  "resettoken",
  "refresh_token",
  "refreshtoken",
  "secret",
  "api_key",
  "apikey",
  "private_key",
  "privatekey",
  "ssn",
  "credit_card",
  "creditcard",
  "cvv",
  "rolpassword",
]);

export interface SafetyState {
  readonly: boolean;
  mode: "development" | "production";
  blockedTables: Set<string>;
  highRiskTables: Set<string>;
  sensitiveColumns: Set<string>;
}

export function buildSafetyState(
  readonly: boolean,
  mode: "development" | "production",
  blockedTables: Set<string>,
  extraSensitiveColumns: Set<string>,
  highRiskTables: Set<string> = new Set(),
): SafetyState {
  const sensitiveColumns = new Set(DEFAULT_SENSITIVE_COLUMNS);
  for (const col of extraSensitiveColumns) sensitiveColumns.add(col.toLowerCase());
  return { readonly, mode, blockedTables, highRiskTables, sensitiveColumns };
}

function isSensitive(column: string, safety: SafetyState): boolean {
  return safety.sensitiveColumns.has(column.toLowerCase());
}

function redactValue(value: unknown, safety: SafetyState, key: string): unknown {
  if (isSensitive(key, safety)) return "***REDACTED***";
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, safety, ""));
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
    return `\\x${value.toString("hex")}`;
  }
  if (value !== null && typeof value === "object") {
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      cleaned[k] = redactValue(v, safety, k);
    }
    return cleaned;
  }
  return value;
}

export function redactRow(
  row: Record<string, unknown>,
  safety: SafetyState,
): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    cleaned[key] = redactValue(value, safety, key);
  }
  return cleaned;
}

export function redactRows(
  rows: Record<string, unknown>[],
  safety: SafetyState,
): Record<string, unknown>[] {
  return rows.map((row) => redactRow(row, safety));
}

const STRIPPED: unique symbol = Symbol("stripped");

function sanitizeValue(
  value: unknown,
  safety: SafetyState,
  stripped: string[],
  key: string,
): unknown {
  if (isSensitive(key, safety)) {
    stripped.push(key);
    return STRIPPED;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, safety, stripped, ""));
  }
  if (value !== null && typeof value === "object") {
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const cleanedValue = sanitizeValue(v, safety, stripped, k);
      if (cleanedValue !== STRIPPED) {
        cleaned[k] = cleanedValue;
      }
    }
    return cleaned;
  }
  return value;
}

export function sanitizeWriteData(
  data: Record<string, unknown>,
  safety: SafetyState,
): { cleaned: Record<string, unknown>; stripped: string[] } {
  const cleaned: Record<string, unknown> = {};
  const stripped: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    const cleanedValue = sanitizeValue(value, safety, stripped, key);
    if (cleanedValue !== STRIPPED) {
      cleaned[key] = cleanedValue;
    }
  }
  return { cleaned, stripped };
}

export type WriteAccessResult =
  { blocked: true; message: string } | { blocked: false; warning: string | null };

export function checkWriteAccess(
  table: string,
  operation: string,
  safety: SafetyState,
): WriteAccessResult {
  if (safety.readonly) {
    return {
      blocked: true,
      message: `[READ-ONLY] ${operation} blocked for "${table}". Read-only mode is enabled.`,
    };
  }
  if (safety.blockedTables.has(table.toLowerCase())) {
    return {
      blocked: true,
      message: `[BLOCKED] "${table}" is in BLOCKED_TABLES and cannot be written to.`,
    };
  }
  if (safety.highRiskTables.has(table.toLowerCase())) {
    return {
      blocked: false,
      warning: `[HIGH-RISK] "${table}" is in HIGH_RISK_TABLES. Proceed with caution; verify the operation before executing.`,
    };
  }
  return { blocked: false, warning: null };
}

const BULK_WARN_THRESHOLD = 10;

export function bulkWarning(count: number, operation: string): string | null {
  if (count > BULK_WARN_THRESHOLD) {
    return `[WARNING] AFFECTING ${count} RECORDS -- this is a bulk ${operation}. Verify before proceeding.`;
  }
  return null;
}
