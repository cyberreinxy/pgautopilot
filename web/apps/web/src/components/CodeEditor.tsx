import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { ScrollArea } from "@pgautopilot/ui";
import type { OverlayScrollbarsComponentRef } from "@pgautopilot/ui";
import { cn } from "../lib/cn";
import { offsetFromLineColumn } from "../lib/editorGeometry";

let charWidthCache: { font: string; width: number } | null = null;

function monoCharWidth(textarea: HTMLTextAreaElement): number {
  const style = getComputedStyle(textarea);
  const font = style.fontFamily;
  if (charWidthCache && charWidthCache.font === font) return charWidthCache.width;
  const probe = document.createElement("span");
  probe.textContent = "0".repeat(10);
  probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${style.font};`;
  document.body.appendChild(probe);
  const width = probe.getBoundingClientRect().width / 10;
  probe.remove();
  charWidthCache = { font, width };
  return width;
}

function offsetAtPoint(
  clientX: number,
  clientY: number,
  textarea: HTMLTextAreaElement,
): number | null {
  const rect = textarea.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
    return null;
  }
  const style = getComputedStyle(textarea);
  const lineHeight = parseFloat(style.lineHeight) || 20;
  const leftPad = parseFloat(style.paddingLeft) || 16;
  const line = Math.max(0, Math.floor((clientY - rect.top) / lineHeight));
  const column = Math.max(
    0,
    Math.round((clientX - rect.left - leftPad) / (monoCharWidth(textarea) || 8)),
  );
  return offsetFromLineColumn(textarea.value, line, column);
}

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  highlight: (code: string) => string;
  showLineNumbers?: boolean;
  placeholder?: string;
  onRun?: () => void;
  disabled?: boolean;
  minHeight?: number;
  maxHeight?: number;
}

export function CodeEditor({
  value,
  onChange,
  highlight,
  showLineNumbers = true,
  placeholder,
  onRun,
  disabled,
  minHeight,
  maxHeight,
}: CodeEditorProps) {
  const lineCount = value.split("\n").length;
  const [caret, setCaret] = useState({ line: 0, column: 0 });
  const [focused, setFocused] = useState(false);
  const [caretX, setCaretX] = useState(0);
  const [transitionS, setTransitionS] = useState(0.06);
  const gutterRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<OverlayScrollbarsComponentRef>(null);
  const mirrorRef = useRef<HTMLSpanElement>(null);
  const prevCaretRef = useRef({ x: 16, y: 13 });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const onChangeRef = useRef(onChange);

  const updateCaret = (target: HTMLTextAreaElement) => {
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const pos = start === end || target.selectionDirection === "backward" ? start : end;
    const before = target.value.slice(0, pos);
    const parts = before.split("\n");
    const line = parts.length - 1;
    setCaret({ line, column: parts[line]?.length ?? 0 });
  };

  const setCaretFromOffset = (offset: number) => {
    let line = 0;
    let col = offset;
    const lines = value.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const len = lines[i]?.length ?? 0;
      if (col <= len) {
        line = i;
        break;
      }
      col -= len + 1;
    }
    setCaret({ line, column: Math.min(col, lines[line]?.length ?? 0) });
  };

  const updateCaretRef = useRef(updateCaret);
  useEffect(() => {
    onChangeRef.current = onChange;
    updateCaretRef.current = updateCaret;
  });

  const dragRef = useRef<{
    startX: number;
    startY: number;
    originStart: number;
    originEnd: number;
    dragging: boolean;
    drop: number | null;
    text: string;
  } | null>(null);

  const [dragGhost, setDragGhost] = useState<{ text: string; x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const handlePointerDown = (event: ReactPointerEvent<HTMLTextAreaElement>) => {
    const target = event.currentTarget;
    if (event.detail === 2) {
      event.preventDefault();
      dragRef.current = null;
      if (target.hasPointerCapture(event.pointerId)) {
        target.releasePointerCapture(event.pointerId);
      }
      const pos = offsetAtPoint(event.clientX, event.clientY, target);
      if (pos !== null) {
        const text = target.value;
        let s = pos;
        while (s > 0 && !/\s/.test(text.charAt(s - 1))) s--;
        let e = pos;
        while (e < text.length && !/\s/.test(text.charAt(e))) e++;
        target.setSelectionRange(s, e);
      }
      updateCaret(target);
      return;
    }
    if (event.detail > 2) return;
    const selStart = target.selectionStart;
    const selEnd = target.selectionEnd;
    if (selStart === selEnd) return;
    const pos = offsetAtPoint(event.clientX, event.clientY, target);
    if (pos === null || pos < selStart || pos > selEnd) return;
    event.preventDefault();
    target.focus();
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originStart: selStart,
      originEnd: selEnd,
      dragging: false,
      drop: null,
      text: target.value.slice(selStart, selEnd),
    };
    target.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLTextAreaElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.dragging && dx * dx + dy * dy < 16) return;
    drag.dragging = true;
    setDragging(true);
    setDragGhost({ text: drag.text, x: event.clientX, y: event.clientY });
    const target = event.currentTarget;
    const offset = offsetAtPoint(event.clientX, event.clientY, target);
    drag.drop = offset;
    if (offset !== null) {
      target.setSelectionRange(offset, offset);
      setCaretFromOffset(offset);
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLTextAreaElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    setDragGhost(null);
    const target = event.currentTarget;
    if (target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
    if (!drag || !drag.dragging || drag.drop === null) return;
    const { originStart, originEnd, drop } = drag;
    if (drop >= originStart && drop <= originEnd) return;
    const text = target.value;
    const selected = text.slice(originStart, originEnd);
    const rest = text.slice(0, originStart) + text.slice(originEnd);
    const insertAt = drop > originEnd ? drop - (originEnd - originStart) : drop;
    onChangeRef.current(rest.slice(0, insertAt) + selected + rest.slice(insertAt));
    const caret = insertAt + selected.length;
    requestAnimationFrame(() => {
      target.focus();
      target.setSelectionRange(caret, caret);
      updateCaretRef.current(target);
    });
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLTextAreaElement>) => {
    dragRef.current = null;
    setDragging(false);
    setDragGhost(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const lineText = value.split("\n")[caret.line]?.slice(0, caret.column) ?? "";

  useLayoutEffect(() => {
    const nextX = 16 + (mirrorRef.current?.offsetWidth ?? 0);
    const nextY = 1 + caret.line * 20;
    const dist =
      Math.abs(nextX - prevCaretRef.current.x) + Math.abs(nextY - prevCaretRef.current.y);
    prevCaretRef.current = { x: nextX, y: nextY };
    setCaretX(mirrorRef.current?.offsetWidth ?? 0);
    setTransitionS(Math.min(0.35, Math.max(0.06, dist / 250)));
  }, [caret, lineText]);

  useEffect(() => {
    setCaret((prev) => {
      const line = Math.min(prev.line, lineCount - 1);
      const column = Math.min(prev.column, (value.split("\n")[line] ?? "").length);
      return line === prev.line && column === prev.column ? prev : { line, column };
    });
  }, [value, lineCount]);

  const syncScroll = () => {
    if (gutterRef.current && scrollRef.current) {
      const viewport = scrollRef.current.osInstance()?.elements().viewport;
      if (viewport) {
        gutterRef.current.scrollTop = viewport.scrollTop;
      }
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (onRun && (event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      onRun();
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      const target = event.currentTarget;
      const start = target.selectionStart;
      onChange(value.slice(0, start) + "  " + value.slice(start));
      requestAnimationFrame(() => {
        target.selectionStart = target.selectionEnd = start + 2;
        updateCaret(target);
      });
    }
  };

  return (
    <div
      className={cn("flex min-h-0", !minHeight && !maxHeight && "h-full flex-1")}
      style={minHeight || maxHeight ? { minHeight, maxHeight, overflow: "hidden" } : undefined}
    >
      {showLineNumbers && (
        <div
          ref={gutterRef}
          className="select-none overflow-hidden border-r border-pg-border bg-pg-surface-2 px-2 py-0 text-right font-pg-mono text-[13px] leading-[20px] text-pg-dim"
          aria-hidden
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i} className={i === caret.line && focused ? "text-pg-primary" : undefined}>
              {i + 1}
            </div>
          ))}
        </div>
      )}
      <ScrollArea
        ref={scrollRef}
        className={cn(
          "relative min-w-0 flex-1 bg-pg-surface-2",
          (minHeight !== undefined || maxHeight !== undefined) && "pg-scroll-bounded",
        )}
        events={{ scroll: syncScroll }}
      >
        <div className="relative w-max min-w-full">
          {focused && (
            <div
              className="pointer-events-none absolute inset-x-0 bg-pg-primary/5"
              style={{ top: caret.line * 20, height: 20 }}
            />
          )}
          <span
            ref={mirrorRef}
            aria-hidden
            className="pointer-events-none invisible absolute left-4 top-0 whitespace-pre font-pg-mono text-[13px] leading-[20px]"
          >
            {lineText}
          </span>
          {value === "" && placeholder && !focused && (
            <pre
              className="pointer-events-none m-0 invisible whitespace-pre px-4 py-0 font-pg-mono text-[13px] leading-[20px] [tab-size:2]"
              aria-hidden
            >
              {placeholder}
            </pre>
          )}
          <pre
            className="pointer-events-none m-0 whitespace-pre px-4 py-0 font-pg-mono text-[13px] leading-[20px] text-pg-text [tab-size:2]"
            aria-hidden
            dangerouslySetInnerHTML={{ __html: highlight(value) + "\n" }}
          />
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => {
              onChange(event.target.value);
              updateCaret(event.currentTarget);
            }}
            onKeyDown={handleKeyDown}
            onSelect={(event) => updateCaret(event.currentTarget)}
            onKeyUp={(event) => updateCaret(event.currentTarget)}
            onClick={(event) => updateCaret(event.currentTarget)}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onDragStart={(event) => event.preventDefault()}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            spellCheck={false}
            placeholder={focused ? undefined : placeholder}
            disabled={disabled}
            draggable={false}
            className="absolute inset-0 resize-none overflow-hidden whitespace-pre bg-transparent px-4 py-0 font-pg-mono text-[13px] leading-[20px] text-transparent caret-transparent outline-none placeholder:text-pg-dim [tab-size:2]"
          />
          {focused && (
            <span
              className={cn(
                "pg-caret pointer-events-none absolute left-0 top-0",
                dragging ? "w-[3px] rounded-sm bg-pg-accent" : "w-[2px] bg-pg-primary",
              )}
              style={{
                height: dragging ? 20 : 18,
                transform: `translate(${16 + caretX}px, ${1 + caret.line * 20}px)`,
                transitionDuration: `${transitionS}s`,
              }}
            />
          )}
          {dragGhost && (
            <span
              className="pointer-events-none fixed z-[999] -translate-y-full rounded-md border border-pg-accent/50 bg-pg-surface/80 px-1.5 py-0.5 font-pg-mono text-[13px] leading-[18px] text-pg-accent shadow-pg-md backdrop-blur-sm"
              style={{ left: dragGhost.x + 12, top: dragGhost.y - 10 }}
            >
              {dragGhost.text}
            </span>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
