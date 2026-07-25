type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

function proxyForHost(host: string, env: NodeJS.ProcessEnv): string | undefined {
  const noProxy = env.NO_PROXY ?? env.no_proxy;
  if (noProxy) {
    const bypass = noProxy
      .split(",")
      .map((entry) => entry.trim().replace(/^\*?\.?/, "").toLowerCase())
      .filter(Boolean);
    if (bypass.some((entry) => host === entry || host.endsWith(`.${entry}`))) return undefined;
  }
  return env.HTTPS_PROXY ?? env.https_proxy ?? env.HTTP_PROXY ?? env.http_proxy;
}

/**
 * Node's global fetch ignores proxy env vars unless started with NODE_USE_ENV_PROXY,
 * which MCP clients cannot set for us. Route through an explicit undici ProxyAgent instead.
 */
export async function createFetch(
  baseUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<FetchLike> {
  let host: string;
  try {
    host = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return fetch;
  }

  const proxy = proxyForHost(host, env);
  if (!proxy || proxy.startsWith("socks")) return fetch;

  try {
    const { ProxyAgent, fetch: undiciFetch } = await import("undici");
    const dispatcher = new ProxyAgent(proxy);
    return (url, init) => undiciFetch(url, { ...init, dispatcher } as never) as unknown as Promise<Response>;
  } catch {
    return fetch;
  }
}
