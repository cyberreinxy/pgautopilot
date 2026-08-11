import { CodeEditor } from "../../../components/CodeEditor";
import { highlightSql } from "../../../lib/sqlHighlight";

const DEFAULT_SQL = "SELECT id, name, email\nFROM users\nWHERE id = 1\nLIMIT 10;";

interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  showLineNumbers: boolean;
  onRun: () => void;
  disabled?: boolean;
}

export function SqlEditor(props: SqlEditorProps) {
  return <CodeEditor {...props} highlight={highlightSql} placeholder={DEFAULT_SQL} />;
}
