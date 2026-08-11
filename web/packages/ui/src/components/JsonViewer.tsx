function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const KEY_COLOR = "color:#2490ef";
const STRING_COLOR = "color:#16a34a";
const NUMBER_COLOR = "color:#b45309";
const BOOL_COLOR = "color:#64748b";
const NULL_COLOR = "color:#94a3b8;font-style:italic";

function highlight(value: string): string {
  let html = "";
  let i = 0;
  const len = value.length;
  while (i < len) {
    const ch = value.charAt(i);
    if (ch === '"') {
      const start = i;
      i++;
      let escaped = false;
      while (i < len) {
        const c = value.charAt(i);
        if (escaped) {
          escaped = false;
          i++;
          continue;
        }
        if (c === "\\") {
          escaped = true;
          i++;
          continue;
        }
        if (c === '"') {
          i++;
          break;
        }
        i++;
      }
      const token = value.slice(start, i);
      const isKey = value.slice(i).replace(/^\s+/, "").startsWith(":");
      const color = isKey ? KEY_COLOR : STRING_COLOR;
      html += `<span style="${color}">${escapeHtml(token)}</span>`;
      continue;
    }
    if (/[0-9-]/.test(ch)) {
      const start = i;
      while (i < len && /[0-9eE+\-.]/.test(value.charAt(i))) i++;
      html += `<span style="${NUMBER_COLOR}">${escapeHtml(value.slice(start, i))}</span>`;
      continue;
    }
    if (/[a-zA-Z]/.test(ch)) {
      const start = i;
      while (i < len && /[a-zA-Z]/.test(value.charAt(i))) i++;
      const word = value.slice(start, i);
      if (word === "true" || word === "false") {
        html += `<span style="${BOOL_COLOR}">${word}</span>`;
      } else if (word === "null") {
        html += `<span style="${NULL_COLOR}">${word}</span>`;
      } else {
        html += escapeHtml(word);
      }
      continue;
    }
    html += escapeHtml(ch);
    i++;
  }
  return html;
}

interface JsonViewerProps {
  value: unknown;
  raw?: boolean;
}

export function JsonViewer({ value, raw = false }: JsonViewerProps) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  if (raw) {
    return <pre className="pg-json">{text}</pre>;
  }
  return <pre className="pg-json" dangerouslySetInnerHTML={{ __html: highlight(text) }} />;
}
