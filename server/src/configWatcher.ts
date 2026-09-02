import { watch, existsSync, type FSWatcher } from "fs";
import { resolve } from "path";
import { loadMultiDbConfig } from "./config.js";
import type { MultiDbConfig } from "./config.js";
import { ConnectionManager, buildDatabaseEntry } from "./connectionManager.js";
import { log } from "./logger.js";

const CONFIG_FILE_NAMES = ["pgautopilot.json", "pgautopilot.config.json"];
const DEBOUNCE_MS = 500;

export interface ConfigWatcherOptions {
  onReload?: (config: MultiDbConfig) => void;
  onError?: (error: Error) => void;
}

function findConfigFile(): string | null {
  for (const name of CONFIG_FILE_NAMES) {
    const filePath = resolve(name);
    if (existsSync(filePath)) return filePath;
  }
  return null;
}

export function watchConfig(
  manager: ConnectionManager,
  options: ConfigWatcherOptions = {},
): { stop: () => void } {
  const configPath = findConfigFile();
  if (!configPath) {
    log.warn("No pgautopilot.json found; config hot-reload disabled.");
    return { stop: () => {} };
  }

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let fsWatcher: FSWatcher | null = null;

  function reload() {
    try {
      const newConfig = loadMultiDbConfig();
      if (!newConfig) {
        log.warn("Config file removed; keeping current connections.");
        return;
      }

      const newNames = Object.keys(newConfig.databases);
      const currentNames = new Set(manager.list().map((d) => d.name));

      // Add new databases (per-database error handling)
      for (const name of newNames) {
        if (!manager.has(name)) {
          try {
            const entryConfig = newConfig.databases[name]!;
            const overrides: Parameters<typeof buildDatabaseEntry>[3] = {};
            if (entryConfig.readonly !== undefined) overrides.readonly = entryConfig.readonly;
            if (entryConfig.schemas !== undefined) overrides.schemas = entryConfig.schemas;
            if (entryConfig.blocked_tables !== undefined) overrides.blocked_tables = entryConfig.blocked_tables;
            if (entryConfig.sensitive_columns !== undefined) overrides.sensitive_columns = entryConfig.sensitive_columns;
            if (entryConfig.high_risk_tables !== undefined) overrides.high_risk_tables = entryConfig.high_risk_tables;
            if (entryConfig.statement_timeout_ms !== undefined) overrides.statement_timeout_ms = entryConfig.statement_timeout_ms;
            if (entryConfig.pool_max !== undefined) overrides.pool_max = entryConfig.pool_max;

            const entry = buildDatabaseEntry(
              name,
              entryConfig.url,
              {
                readonly: newConfig.defaults.readonly,
                schemas: newConfig.defaults.schemas,
                statementTimeoutMs: newConfig.defaults.statement_timeout_ms,
                poolMax: newConfig.defaults.pool_max,
              },
              overrides,
            );
            manager.register(name, entry);
            log.info(`Hot-reload: added database "${name}"`);
          } catch (err) {
            log.error(`Hot-reload: failed to add database "${name}": ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }

      // Remove databases no longer in config
      for (const name of currentNames) {
        if (!newNames.includes(name)) {
          log.info(`Hot-reload: database "${name}" removed from config (pool stays alive until shutdown)`);
        }
      }

      options.onReload?.(newConfig);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      log.error(`Config hot-reload failed: ${error.message}`);
      options.onError?.(error);
    }
  }

  function handleChange() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      log.info("Config file changed, reloading...");
      reload();
    }, DEBOUNCE_MS);
  }

  try {
    fsWatcher = watch(configPath, { persistent: false }, (eventType) => {
      if (eventType === "change") {
        handleChange();
      }
    });
    log.info(`Watching ${configPath} for changes.`);
  } catch (err) {
    log.warn(`Could not watch config file: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    stop: () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (fsWatcher) {
        fsWatcher.close();
        fsWatcher = null;
      }
    },
  };
}
