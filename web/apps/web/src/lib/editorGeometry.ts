export function offsetFromLineColumn(value: string, line: number, column: number): number {
  const lines = value.split("\n");
  let offset = 0;
  for (let i = 0; i < line; i++) offset += (lines[i]?.length ?? 0) + 1;
  return offset + Math.min(column, lines[line]?.length ?? 0);
}
