const IDENT_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function quoteIdent(name: string): string {
  if (!IDENT_PATTERN.test(name)) {
    throw new Error(`Invalid identifier: "${name}"`);
  }
  return `"${name}"`;
}

function assertKnownColumn(column: string, validColumns: Set<string>): void {
  if (!validColumns.has(column)) {
    throw new Error(
      `Unknown column "${column}". Available columns: ${[...validColumns].join(", ")}`,
    );
  }
}

const OPERATORS: Record<string, string> = {
  equals: "=",
  not: "!=",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
};

export interface BuiltFragment {
  text: string;
  values: unknown[];
}

export function buildWhere(
  where: Record<string, unknown> | undefined,
  validColumns: Set<string>,
  paramOffset: number,
): BuiltFragment {
  if (!where || Object.keys(where).length === 0) {
    return { text: "", values: [] };
  }

  const clauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = paramOffset;

  for (const [column, rawValue] of Object.entries(where)) {
    assertKnownColumn(column, validColumns);
    const ident = quoteIdent(column);

    if (rawValue === null) {
      clauses.push(`${ident} IS NULL`);
      continue;
    }

    if (rawValue !== null && typeof rawValue === "object" && !Array.isArray(rawValue)) {
      const condObj = rawValue as Record<string, unknown>;
      for (const [op, opValue] of Object.entries(condObj)) {
        if (op === "in" || op === "notIn") {
          if (!Array.isArray(opValue) || opValue.length === 0) {
            throw new Error(`"${op}" for column "${column}" requires a non-empty array`);
          }
          const placeholders = opValue.map(() => `$${paramIndex++}`).join(", ");
          clauses.push(`${ident} ${op === "in" ? "IN" : "NOT IN"} (${placeholders})`);
          values.push(...opValue);
        } else if (op === "contains" || op === "startsWith" || op === "endsWith") {
          const pattern =
            op === "contains"
              ? `%${opValue}%`
              : op === "startsWith"
                ? `${opValue}%`
                : `%${opValue}`;
          clauses.push(`${ident} ILIKE $${paramIndex++}`);
          values.push(pattern);
        } else if (op in OPERATORS) {
          clauses.push(`${ident} ${OPERATORS[op]} $${paramIndex++}`);
          values.push(opValue);
        } else {
          throw new Error(`Unsupported filter operator "${op}" for column "${column}"`);
        }
      }
      continue;
    }

    clauses.push(`${ident} = $${paramIndex++}`);
    values.push(rawValue);
  }

  return { text: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", values };
}

export function buildOrderBy(
  orderBy: Record<string, string> | undefined,
  validColumns: Set<string>,
): string {
  if (!orderBy || Object.keys(orderBy).length === 0) return "";
  const parts: string[] = [];
  for (const [column, direction] of Object.entries(orderBy)) {
    assertKnownColumn(column, validColumns);
    if (typeof direction !== "string") {
      throw new Error(`Invalid sort direction for column "${column}".`);
    }
    const norm = direction.toLowerCase();
    let order = "ASC";
    let nulls = "";
    if (norm === "desc") order = "DESC";
    else if (norm === "asc_nulls_last") nulls = " NULLS LAST";
    else if (norm === "desc_nulls_first") {
      order = "DESC";
      nulls = " NULLS FIRST";
    } else if (norm !== "asc") {
      throw new Error(
        `Invalid sort direction "${direction}" for column "${column}". Use "asc", "desc", "asc_nulls_last", or "desc_nulls_first".`,
      );
    }
    parts.push(`${quoteIdent(column)} ${order}${nulls}`);
  }
  return parts.length ? `ORDER BY ${parts.join(", ")}` : "";
}

export function buildSelectColumns(
  select: string[] | undefined,
  validColumns: Set<string>,
): string {
  if (!select || select.length === 0) return "*";
  return select
    .map((c) => {
      assertKnownColumn(c, validColumns);
      return quoteIdent(c);
    })
    .join(", ");
}

export function buildInsert(
  table: string,
  data: Record<string, unknown>,
  validColumns: Set<string>,
): BuiltFragment {
  const columns = Object.keys(data);
  if (columns.length === 0) throw new Error("No fields provided to insert");
  columns.forEach((c) => assertKnownColumn(c, validColumns));

  const idents = columns.map((c) => quoteIdent(c)).join(", ");
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
  const values = columns.map((c) => data[c]);

  return {
    text: `INSERT INTO ${quoteIdent(table)} (${idents}) VALUES (${placeholders}) RETURNING *`,
    values,
  };
}

export function buildUpdate(
  table: string,
  data: Record<string, unknown>,
  where: Record<string, unknown> | undefined,
  validColumns: Set<string>,
): BuiltFragment {
  const columns = Object.keys(data);
  if (columns.length === 0) throw new Error("No fields provided to update");
  columns.forEach((c) => assertKnownColumn(c, validColumns));

  const setClauses = columns.map((c, i) => `${quoteIdent(c)} = $${i + 1}`).join(", ");
  const values: unknown[] = columns.map((c) => data[c]);

  const whereFragment = buildWhere(where, validColumns, values.length + 1);
  values.push(...whereFragment.values);

  return {
    text: `UPDATE ${quoteIdent(table)} SET ${setClauses} ${whereFragment.text} RETURNING *`,
    values,
  };
}

export function buildDelete(
  table: string,
  where: Record<string, unknown> | undefined,
  validColumns: Set<string>,
): BuiltFragment {
  const whereFragment = buildWhere(where, validColumns, 1);
  return {
    text: `DELETE FROM ${quoteIdent(table)} ${whereFragment.text} RETURNING *`,
    values: whereFragment.values,
  };
}

export function buildUpsert(
  table: string,
  insertData: Record<string, unknown>,
  updateData: Record<string, unknown>,
  conflictColumns: string[],
  validColumns: Set<string>,
): BuiltFragment {
  const insertColumns = Object.keys(insertData);
  if (insertColumns.length === 0) throw new Error("No fields provided to insert");
  insertColumns.forEach((c) => assertKnownColumn(c, validColumns));

  const insertIdents = insertColumns.map((c) => quoteIdent(c)).join(", ");
  const insertPlaceholders = insertColumns.map((_, i) => `$${i + 1}`).join(", ");
  const values: unknown[] = insertColumns.map((c) => insertData[c]);

  const conflictIdents = conflictColumns.map((c) => quoteIdent(c)).join(", ");
  const updateColumns = Object.keys(updateData).filter((c) => !conflictColumns.includes(c));

  let setClause: string;
  if (updateColumns.length === 0) {
    setClause = conflictColumns.map((c) => `${quoteIdent(c)} = ${quoteIdent(c)}`).join(", ");
  } else {
    updateColumns.forEach((c) => assertKnownColumn(c, validColumns));
    const parts: string[] = [];
    for (const c of updateColumns) {
      values.push(updateData[c]);
      parts.push(`${quoteIdent(c)} = $${values.length}`);
    }
    setClause = parts.join(", ");
  }

  return {
    text: `INSERT INTO ${quoteIdent(table)} (${insertIdents}) VALUES (${insertPlaceholders}) ON CONFLICT (${conflictIdents}) DO UPDATE SET ${setClause} RETURNING *`,
    values,
  };
}

export function buildCount(
  table: string,
  where: Record<string, unknown> | undefined,
  validColumns: Set<string>,
): BuiltFragment {
  const whereFragment = buildWhere(where, validColumns, 1);
  return {
    text: `SELECT COUNT(*)::int AS count FROM ${quoteIdent(table)} ${whereFragment.text}`,
    values: whereFragment.values,
  };
}
