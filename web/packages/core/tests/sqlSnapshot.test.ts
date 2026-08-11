import { describe, expect, it } from "vitest";
import { toLiteral } from "../src/sqlSnapshot.js";

describe("toLiteral", () => {
  it("escapes single quotes in strings", () => {
    expect(toLiteral("Bob' quit")).toBe("'Bob'' quit'");
  });

  it("maps null and undefined to NULL", () => {
    expect(toLiteral(null)).toBe("NULL");
    expect(toLiteral(undefined)).toBe("NULL");
  });

  it("renders booleans and finite numbers", () => {
    expect(toLiteral(true)).toBe("true");
    expect(toLiteral(false)).toBe("false");
    expect(toLiteral(42)).toBe("42");
  });

  it("serializes objects as JSONB", () => {
    expect(toLiteral({ a: "b'c" })).toBe("'{\"a\":\"b''c\"}'::jsonb");
  });

  it("hex-encodes buffers as bytea", () => {
    expect(toLiteral(Buffer.from([0x48, 0x69]))).toBe("decode('4869', 'hex')");
  });

  it("emits dates as ISO timestamps", () => {
    expect(toLiteral(new Date("2021-04-16T04:48:25.000Z"))).toBe("'2021-04-16T04:48:25.000Z'");
  });
});

