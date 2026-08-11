import { describe, it, expect } from "vitest";
import { friendlyDbError, relationNameFromError } from "../src/errors.js";

describe("friendlyDbError", () => {
  it("names the column and table for an undefined column", () => {
    const err = { code: "42703", column: "fullname", table: "user" };
    expect(friendlyDbError(err)).toBe('Column "fullname" doesn\'t exist on table "user".');
  });

  it("names the column when the table is unknown", () => {
    const err = { code: "42703", column: "fullname" };
    expect(friendlyDbError(err)).toBe('Column "fullname" doesn\'t exist.');
  });

  it("names the table for an undefined table", () => {
    const err = { code: "42P01", table: "user" };
    expect(friendlyDbError(err)).toBe('Table "user" doesn\'t exist in the database.');
  });

  it("falls back to the generic message when names are missing", () => {
    expect(friendlyDbError({ code: "42703" })).toBe("That column doesn't exist on this table.");
    expect(friendlyDbError({ code: "42P01" })).toBe("That table doesn't exist in the database.");
  });

  it("extracts the column name from the error message", () => {
    const err = { code: "42703", message: 'column "email" of relation "users" does not exist' };
    expect(friendlyDbError(err)).toBe('Column "email" doesn\'t exist on table "users".');
  });

  it("lists multiple columns found in the error message", () => {
    const err = {
      code: "42703",
      message:
        'column "email" of relation "users" does not exist, column "name" of relation "users" does not exist',
    };
    expect(friendlyDbError(err)).toBe('Columns "email", "name" don\'t exist on table "users".');
  });

  it("extracts a single column from the error detail", () => {
    const err = {
      code: "42703",
      detail: 'column "phone" of relation "user" does not exist',
    };
    expect(friendlyDbError(err)).toBe('Column "phone" doesn\'t exist on table "user".');
  });

  it("extracts the relation name from the error text", () => {
    const err = { code: "42703", message: 'column "id" of relation "users" does not exist' };
    expect(relationNameFromError(err)).toBe("users");
  });

  it("returns null when no relation appears in the error text", () => {
    expect(relationNameFromError({ code: "42703", message: "column does not exist" })).toBeNull();
  });
});

