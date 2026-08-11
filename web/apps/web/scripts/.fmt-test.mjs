import { format as sqltoolsFormat } from "@sqltools/formatter";
import { format as sqlFormat } from "sql-formatter";

const samples = [
  "SELECT id, name, email\nFROM users\nWHERE id = 1\nLIMIT 10;",
  "SELECT u.id, u.name, count(o.id) AS orders\nFROM users u\nLEFT JOIN orders o ON o.user_id = u.id\nWHERE u.active = true\nGROUP BY u.id, u.name\nORDER BY orders DESC\nLIMIT 25;",
  "INSERT INTO users (name, email) VALUES ('Jane', 'j@e.com');",
  "SELECT * FROM tbl WHERE foo = ? AND bar IN (1, 2, 3);",
];

for (const sql of samples) {
  console.log("--- input ---\n" + sql);
  console.log("--- @sqltools/formatter ---");
  try {
    console.log(sqltoolsFormat(sql, { language: "postgresql", indent: "  ", uppercase: true }));
  } catch (e) {
    console.log("ERROR: " + (e instanceof Error ? e.message : String(e)));
  }
  console.log("--- sql-formatter ---");
  console.log(sqlFormat(sql, { language: "postgresql", tabWidth: 2 }));
  console.log("=====");
}
