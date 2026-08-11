import { describe, it, expect } from "vitest";
import { offsetFromLineColumn } from "./editorGeometry";

describe("offsetFromLineColumn", () => {
  const text = "ab\ncd\nef";

  it("maps a column on line 0 to the plain offset", () => {
    expect(offsetFromLineColumn(text, 0, 1)).toBe(1);
  });

  it("adds preceding newlines for later lines", () => {
    expect(offsetFromLineColumn(text, 1, 1)).toBe(4);
    expect(offsetFromLineColumn(text, 2, 0)).toBe(6);
  });

  it("clamps the column to the line length", () => {
    expect(offsetFromLineColumn(text, 2, 100)).toBe(8);
  });
});
