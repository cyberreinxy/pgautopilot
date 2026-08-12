export declare const PG_ENTRY: { command: string; args: string[] };

export declare const editorConfigs: {
    rel: string;
    key: string;
    entry: Record<string, unknown>;
}[];

export declare function claudeConfigPath(): string;

export declare function writeEditorConfig(
    filePath: string,
    key: string,
    entry: Record<string, unknown>,
): "created" | "merged" | "unparseable";
