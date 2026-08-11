function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function highlightJson(input: string): string {
  let html = "";
  let i = 0;
  const len = input.length;
  while (i < len) {
    const ch = input.charAt(i);
    if (ch === '"') {
      const start = i;
      i++;
      let escaped = false;
      while (i < len) {
        const c = input.charAt(i);
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
      const token = input.slice(start, i);
      const isKey = input.slice(i).replace(/^\s+/, "").startsWith(":");
      html += `<span class="${isKey ? "tok-key" : "tok-str"}">${escapeHtml(token)}</span>`;
      continue;
    }
    if (/[0-9-]/.test(ch)) {
      const start = i;
      while (i < len && /[0-9eE+\-.]/.test(input.charAt(i))) i++;
      html += `<span class="tok-num">${escapeHtml(input.slice(start, i))}</span>`;
      continue;
    }
    if (/[a-zA-Z]/.test(ch)) {
      const start = i;
      while (i < len && /[a-zA-Z]/.test(input.charAt(i))) i++;
      const word = input.slice(start, i);
      if (word === "true" || word === "false") {
        html += `<span class="tok-bool">${word}</span>`;
      } else if (word === "null") {
        html += `<span class="tok-com">${word}</span>`;
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
