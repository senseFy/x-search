export interface Config {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

const DEFAULT_BASE_URL = "https://api.x.ai/v1";
const DEFAULT_MODEL = "grok-4.5";
const DEFAULT_TIMEOUT_MS = 180_000;

export class ConfigError extends Error {}

function parseTimeout(raw: string | undefined): number {
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new ConfigError(`X_SEARCH_TIMEOUT_MS must be a positive number, got: ${raw}`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const apiKey = env.XAI_API_KEY?.trim();
  if (!apiKey) {
    throw new ConfigError(
      "XAI_API_KEY is not set. Create a key at https://console.x.ai and pass it to the MCP server via the env block of your client config.",
    );
  }

  return {
    apiKey,
    baseUrl: (env.XAI_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    model: env.XAI_MODEL?.trim() || DEFAULT_MODEL,
    timeoutMs: parseTimeout(env.X_SEARCH_TIMEOUT_MS),
  };
}
