import { CodeEditor } from "../../../components/CodeEditor";
import { highlightJson } from "../../../lib/jsonHighlight";

interface ParamsEditorProps {
  value: string;
  onChange: (value: string) => void;
  onRun?: () => void;
  disabled?: boolean;
}

export function ParamsEditor({ value, onChange, onRun, disabled }: ParamsEditorProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <CodeEditor
        value={value}
        onChange={onChange}
        highlight={highlightJson}
        placeholder="{}"
        onRun={onRun}
        disabled={disabled}
      />
    </div>
  );
}
