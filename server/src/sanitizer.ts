function isIdentChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_$]/.test(ch);
}

function isEscapeString(sql: string, i: number): boolean {
  if (i < 1) return false;
  const c = sql[i - 1];
  if ((c === "e" || c === "E") && !isIdentChar(sql[i - 2])) return true;
  if (c === "&" && (sql[i - 2] === "u" || sql[i - 2] === "U") && !isIdentChar(sql[i - 3])) {
    return true;
  }
  return false;
}

export function stripSqlStrings(sql: string): string {
  let result = "";
  let i = 0;
  const len = sql.length;
  while (i < len) {
    if (sql[i] === "-" && sql[i + 1] === "-") {
      while (i < len && sql[i] !== "\n") i++;
      result += " ";
      continue;
    }
    if (sql[i] === "/" && sql[i + 1] === "*") {
      i += 2;
      while (i < len - 1 && !(sql[i] === "*" && sql[i + 1] === "/")) i++;
      i += 2;
      result += " ";
      continue;
    }
    if (sql[i] === "$") {
      const tagStart = i;
      i++;
      let tag = "";
      while (i < len && sql[i] !== "$") {
        tag += sql[i];
        i++;
      }
      if (i < len && sql[i] === "$") {
        i++;
        const closeTag = "$" + tag + "$";
        const closeIdx = sql.indexOf(closeTag, i);
        if (closeIdx !== -1) {
          i = closeIdx + closeTag.length;
          result += "''";
          continue;
        }
      }
      i = tagStart + 1;
      result += "$";
      continue;
    }
    if (sql[i] === "'") {
      const escape = isEscapeString(sql, i);
      const start = i;
      let closed = false;
      i++;
      while (i < len) {
        if (escape && sql[i] === "\\" && i + 1 < len) {
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          if (i + 1 < len && sql[i + 1] === "'") {
            i += 2;
            continue;
          }
          i++;
          closed = true;
          break;
        }
        i++;
      }
      if (closed) {
        result += "''";
      } else {
        result += sql.slice(start, i);
      }
      continue;
    }
    if (sql[i] === '"') {
      const start = i;
      let closed = false;
      i++;
      while (i < len) {
        if (sql[i] === '"') {
          if (i + 1 < len && sql[i + 1] === '"') {
            i += 2;
            continue;
          }
          i++;
          closed = true;
          break;
        }
        i++;
      }
      if (closed) {
        result += '""';
      } else {
        result += sql.slice(start, i);
      }
      continue;
    }
    result += sql[i];
    i++;
  }
  return result;
}
