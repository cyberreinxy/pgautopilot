const KEYWORDS = new Set([
  "select",
  "from",
  "where",
  "insert",
  "into",
  "values",
  "update",
  "set",
  "delete",
  "create",
  "table",
  "alter",
  "drop",
  "index",
  "view",
  "schema",
  "primary",
  "key",
  "foreign",
  "references",
  "unique",
  "constraint",
  "not",
  "null",
  "default",
  "and",
  "or",
  "in",
  "is",
  "like",
  "ilike",
  "between",
  "limit",
  "offset",
  "order",
  "by",
  "group",
  "having",
  "join",
  "inner",
  "left",
  "right",
  "full",
  "outer",
  "cross",
  "on",
  "as",
  "asc",
  "desc",
  "distinct",
  "count",
  "sum",
  "avg",
  "min",
  "max",
  "returning",
  "with",
  "case",
  "when",
  "then",
  "else",
  "end",
  "cast",
  "union",
  "all",
  "exists",
  "any",
  "some",
  "begin",
  "commit",
  "rollback",
  "transaction",
  "collate",
  "using",
  "coalesce",
  "nullif",
  "current_timestamp",
  "interval",
  "extract",
  "boolean",
  "integer",
  "bigint",
  "numeric",
  "text",
  "varchar",
  "char",
  "date",
  "time",
  "timestamp",
  "uuid",
  "json",
  "jsonb",
  "serial",
  "bigserial",
  "grant",
  "revoke",
  "to",
  "explain",
  "analyze",
  "vacuum",
  "truncate",
  "cascade",
  "restrict",
  "conflict",
]);

const FUNCTIONS = new Set([
  "now",
  "current_date",
  "current_time",
  "lower",
  "upper",
  "trim",
  "length",
  "char_length",
  "substring",
  "substr",
  "replace",
  "concat",
  "greatest",
  "least",
  "abs",
  "round",
  "ceil",
  "floor",
  "random",
  "jsonb_agg",
  "array_agg",
  "string_agg",
  "to_char",
  "to_date",
  "to_number",
  "to_timestamp",
  "date_trunc",
  "generate_series",
  "coalesce",
  "nullif",
]);

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function isEscapeString(sql: string, i: number): boolean {
  if (i < 1) return false;
  const c = sql[i - 1];
  if ((c === "e" || c === "E") && !/[A-Za-z0-9_$]/.test(sql[i - 2] ?? "")) return true;
  if (
    c === "&" &&
    (sql[i - 2] === "u" || sql[i - 2] === "U") &&
    !/[A-Za-z0-9_$]/.test(sql[i - 3] ?? "")
  ) {
    return true;
  }
  return false;
}

export function highlightSql(sql: string): string {
  let html = "";
  let i = 0;
  const len = sql.length;
  while (i < len) {
    const ch = sql.charAt(i);
    if (ch === "-" && sql[i + 1] === "-") {
      const start = i;
      while (i < len && sql[i] !== "\n") i++;
      html += `<span class="tok-com">${escapeHtml(sql.slice(start, i))}</span>`;
      continue;
    }
    if (ch === "/" && sql[i + 1] === "*") {
      const start = i;
      i += 2;
      while (i < len - 1 && !(sql[i] === "*" && sql[i + 1] === "/")) i++;
      i += 2;
      html += `<span class="tok-com">${escapeHtml(sql.slice(start, i))}</span>`;
      continue;
    }
    if (ch === "'") {
      const escape = isEscapeString(sql, i);
      const start = i;
      i++;
      while (i < len) {
        if (escape && sql[i] === "\\" && i + 1 < len) {
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      html += `<span class="tok-str">${escapeHtml(sql.slice(start, i))}</span>`;
      continue;
    }
    if (ch === '"') {
      const start = i;
      i++;
      while (i < len) {
        if (sql[i] === '"') {
          if (sql[i + 1] === '"') {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      html += escapeHtml(sql.slice(start, i));
      continue;
    }
    if (ch === "$") {
      let matched = false;
      const start = i;
      i++;
      let tag = "";
      while (i < len && sql[i] !== "$") {
        tag += sql[i];
        i++;
      }
      if (i < len && sql[i] === "$") {
        i++;
        const close = "$" + tag + "$";
        const idx = sql.indexOf(close, i);
        if (idx !== -1) {
          i = idx + close.length;
          html += `<span class="tok-str">${escapeHtml(sql.slice(start, i))}</span>`;
          matched = true;
        }
      }
      if (matched) continue;
      i = start;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const start = i;
      while (i < len && /[A-Za-z0-9_$]/.test(sql.charAt(i))) i++;
      const word = sql.slice(start, i);
      const lower = word.toLowerCase();
      if (KEYWORDS.has(lower)) {
        html += `<span class="tok-key">${escapeHtml(word)}</span>`;
      } else if (FUNCTIONS.has(lower) && sql[i] === "(") {
        html += `<span class="tok-fn">${escapeHtml(word)}</span>`;
      } else {
        html += escapeHtml(word);
      }
      continue;
    }
    if (/[0-9]/.test(ch)) {
      const start = i;
      if (ch === "0" && /[xX]/.test(sql[i + 1] ?? "")) {
        i += 2;
        while (i < len && /[0-9a-fA-F]/.test(sql[i] ?? "")) i++;
      } else {
        while (i < len && /[0-9]/.test(sql[i] ?? "")) i++;
        if ((sql[i] ?? "") === "." && /[0-9]/.test(sql[i + 1] ?? "")) {
          i++;
          while (i < len && /[0-9]/.test(sql[i] ?? "")) i++;
        }
        if (/[eE]/.test(sql[i] ?? "")) {
          const expStart = i;
          i++;
          if (/[+-]/.test(sql[i] ?? "")) i++;
          if (/[0-9]/.test(sql[i] ?? "")) {
            while (i < len && /[0-9]/.test(sql[i] ?? "")) i++;
          } else {
            i = expStart;
          }
        }
      }
      html += `<span class="tok-num">${escapeHtml(sql.slice(start, i))}</span>`;
      continue;
    }
    html += escapeHtml(ch);
    i++;
  }
  return html;
}
