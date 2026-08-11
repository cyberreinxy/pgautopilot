import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ParamsEditor } from "./ParamsEditor";

describe("ParamsEditor", () => {
  it("renders JSON params in the textarea", () => {
    render(
      <ParamsEditor
        value={JSON.stringify({ table: "users", take: 10 }, null, 2)}
        onChange={() => undefined}
      />,
    );
    const textarea = screen.getByPlaceholderText("{}") as HTMLTextAreaElement;
    expect(textarea.value).toContain('"users"');
  });

  it("calls onChange when editing", () => {
    const onChange = vi.fn();
    render(<ParamsEditor value="{}" onChange={onChange} />);
    const textarea = screen.getByPlaceholderText("{}");
    fireEvent.change(textarea, { target: { value: '{"a":1}' } });
    expect(onChange).toHaveBeenCalledWith('{"a":1}');
  });
});
