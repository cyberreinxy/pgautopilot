import type {
  ToolInvokeArgs,
  ToolInvokeResponse,
  ToolListResponse,
  HealthResponse,
  SchemaResponse,
  MigrationListResponse,
  MigrationContentResponse,
  ApplyMigrationsResponse,
  ApplyMigrationsRequest,
  RuntimeConfig,
  ReadonlyResponse,
  ToolSummary,
  LiveChangeEvent,
  LogListResponse,
  LogLevel,
  SnapshotListResponse,
  SnapshotContentResponse,
  CreateSnapshotRequest,
  SnapshotCreateResponse,
  RestoreSnapshotRequest,
  RestoreSnapshotResponse,
} from "@pgautopilot/contracts";

export interface ApiClientOptions {
  baseUrl: string;
  token?: string;
  fetchImpl?: typeof fetch;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "").replace(/\/api$/i, "");
    this.token = options.token;
    this.fetchImpl = (options.fetchImpl ?? fetch).bind(globalThis);
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;
    return headers;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers: { ...this.headers(), ...(init?.headers ?? {}) },
      });
    } catch {
      throw new ApiError("Can't reach the server. Make sure the API is running and try again.", 0);
    }
    if (!response.ok) {
      let message = `Request failed with status ${response.status}`;
      try {
        const body = (await response.json()) as { error?: string };
        if (body.error) message = body.error;
      } catch {
        // ignore parse failures
      }
      throw new ApiError(message, response.status);
    }
    return (await response.json()) as T;
  }

  async listTools(): Promise<ToolSummary[]> {
    const res = await this.request<ToolListResponse>("/api/tools");
    return res.tools.map((t) => ({ name: t.name, title: t.title, description: t.description }));
  }

  async invokeTool(name: string, args: ToolInvokeArgs): Promise<ToolInvokeResponse> {
    return this.request<ToolInvokeResponse>(`/api/tools/${encodeURIComponent(name)}`, {
      method: "POST",
      body: JSON.stringify(args),
    });
  }

  async health(): Promise<HealthResponse> {
    const response = await this.fetchImpl(`${this.baseUrl}/api/health`, {
      headers: this.headers(),
    });
    const body = (await response.json().catch(() => ({}))) as Partial<HealthResponse>;
    return {
      status: response.ok ? (body.status ?? "connected") : "disconnected",
      uptimeSeconds: body.uptimeSeconds ?? 0,
      version: body.version ?? "",
      mode: body.mode ?? "development",
      reason: body.reason ?? (response.ok ? null : `HTTP ${response.status}`),
      latencyMs: body.latencyMs ?? null,
      databaseUrlConfigured: body.databaseUrlConfigured ?? false,
      pool: body.pool ?? { totalCount: 0, idleCount: 0, waitingCount: 0 },
      lastError: body.lastError ?? null,
      lastSuccessAt: body.lastSuccessAt ?? null,
    };
  }

  async getSchema(refresh = false): Promise<SchemaResponse> {
    return this.request<SchemaResponse>(`/api/schema${refresh ? "?refresh=1" : ""}`);
  }

  async getMigrations(): Promise<MigrationListResponse> {
    return this.request<MigrationListResponse>("/api/migrations");
  }

  async getMigrationContent(version: number): Promise<MigrationContentResponse> {
    return this.request<MigrationContentResponse>(`/api/migrations/${version}`);
  }

  async applyMigrations(): Promise<ApplyMigrationsResponse> {
    return this.request<ApplyMigrationsResponse>("/api/migrations/apply", {
      method: "POST",
      body: JSON.stringify({}),
    });
  }

  async applyMigrationsSelected(versions: number[]): Promise<ApplyMigrationsResponse> {
    return this.request<ApplyMigrationsResponse>("/api/migrations/apply-selected", {
      method: "POST",
      body: JSON.stringify({ versions } as ApplyMigrationsRequest),
    });
  }

  async applyMigration(version: number): Promise<ApplyMigrationsResponse> {
    return this.request<ApplyMigrationsResponse>(`/api/migrations/apply/${version}`, {
      method: "POST",
    });
  }

  async revertMigrations(versions: number[], force = false): Promise<ApplyMigrationsResponse> {
    return this.request<ApplyMigrationsResponse>("/api/migrations/revert", {
      method: "POST",
      body: JSON.stringify({ versions, force } as ApplyMigrationsRequest & { force: boolean }),
    });
  }

  async listSnapshots(): Promise<SnapshotListResponse> {
    return this.request<SnapshotListResponse>("/api/snapshots");
  }

  async getSnapshotContent(id: string): Promise<SnapshotContentResponse> {
    return this.request<SnapshotContentResponse>(
      `/api/snapshots/${encodeURIComponent(id)}/content`,
    );
  }

  async createSnapshot(label?: string): Promise<SnapshotCreateResponse> {
    return this.request<SnapshotCreateResponse>("/api/snapshots", {
      method: "POST",
      body: JSON.stringify({ label } as CreateSnapshotRequest),
    });
  }

  async restoreSnapshot(id: string): Promise<RestoreSnapshotResponse> {
    return this.request<RestoreSnapshotResponse>("/api/snapshots/restore", {
      method: "POST",
      body: JSON.stringify({ id } as RestoreSnapshotRequest),
    });
  }

  async getConfig(): Promise<RuntimeConfig> {
    return this.request<RuntimeConfig>("/api/config");
  }

  async getLogs(
    options: { level?: LogLevel; limit?: number; since?: string } = {},
  ): Promise<LogListResponse> {
    const params = new URLSearchParams();
    if (options.level) params.set("level", options.level);
    if (options.limit) params.set("limit", String(options.limit));
    if (options.since) params.set("since", options.since);
    const query = params.toString();
    return this.request<LogListResponse>(`/api/logs${query ? `?${query}` : ""}`);
  }

  async setReadonly(readonly: boolean): Promise<ReadonlyResponse> {
    return this.request<ReadonlyResponse>("/api/config/readonly", {
      method: "POST",
      body: JSON.stringify({ readonly }),
    });
  }

  async streamChangeEvents(
    onEvent: (event: LiveChangeEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const response = await this.fetchImpl(`${this.baseUrl}/api/live`, {
      headers: this.headers(),
      signal,
    });
    if (!response.ok) {
      throw new ApiError(`Live stream failed with status ${response.status}`, response.status);
    }
    const body = response.body;
    if (!body) throw new ApiError("Live stream has no body", 0);
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (; ;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line.startsWith("data:")) {
          const payload = line.slice(5).trim();
          if (payload) {
            const event = parseLiveEvent(payload);
            if (event) onEvent(event);
          }
        }
        newline = buffer.indexOf("\n");
      }
    }
  }
}

function parseLiveEvent(payload: string): LiveChangeEvent | null {
  try {
    return JSON.parse(payload) as LiveChangeEvent;
  } catch {
    return null;
  }
}
