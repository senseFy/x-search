import type { Config } from "./config.js";
import { createFetch } from "./proxy.js";

export interface XSearchRequest {
  query: string;
  model?: string;
  allowedHandles?: string[];
  excludedHandles?: string[];
  fromDate?: string;
  toDate?: string;
  enableImageUnderstanding?: boolean;
  enableVideoUnderstanding?: boolean;
  inlineCitations?: boolean;
}

export interface XSearchResult {
  text: string;
  citations: string[];
  model: string;
}

export class XSearchError extends Error {}

interface Annotation {
  type?: string;
  url?: string;
}

interface ContentBlock {
  type?: string;
  text?: string;
  annotations?: Annotation[];
}

interface OutputItem {
  type?: string;
  content?: ContentBlock[];
}

interface ResponsesPayload {
  model?: string;
  output?: OutputItem[];
  citations?: unknown;
  error?: { message?: string } | string;
}

function buildToolConfig(request: XSearchRequest): Record<string, unknown> {
  const tool: Record<string, unknown> = { type: "x_search" };
  if (request.allowedHandles?.length) tool.allowed_x_handles = request.allowedHandles;
  if (request.excludedHandles?.length) tool.excluded_x_handles = request.excludedHandles;
  if (request.fromDate) tool.from_date = request.fromDate;
  if (request.toDate) tool.to_date = request.toDate;
  if (request.enableImageUnderstanding) tool.enable_image_understanding = true;
  if (request.enableVideoUnderstanding) tool.enable_video_understanding = true;
  return tool;
}

function extract(payload: ResponsesPayload): { text: string; citations: string[] } {
  const chunks: string[] = [];
  const citations = new Set<string>();

  for (const item of payload.output ?? []) {
    if (item.type !== "message") continue;
    for (const block of item.content ?? []) {
      if (block.type === "output_text" && typeof block.text === "string") {
        chunks.push(block.text);
      }
      for (const annotation of block.annotations ?? []) {
        if (annotation.type === "url_citation" && annotation.url) citations.add(annotation.url);
      }
    }
  }

  if (Array.isArray(payload.citations)) {
    for (const url of payload.citations) {
      if (typeof url === "string" && url) citations.add(url);
    }
  }

  return { text: chunks.join("\n\n").trim(), citations: [...citations] };
}

function errorMessage(status: number, body: string): string {
  const detail = body.slice(0, 600);
  if (status === 401 || status === 403 || /api key/i.test(body)) {
    return `xAI rejected the API key (HTTP ${status}). Check XAI_API_KEY and that the key's team has credit. ${detail}`;
  }
  if (status === 429) {
    return `xAI rate limit hit (HTTP 429). Retry later or lower request volume. ${detail}`;
  }
  return `xAI request failed (HTTP ${status}). ${detail}`;
}

export async function xSearch(config: Config, request: XSearchRequest): Promise<XSearchResult> {
  if (request.allowedHandles?.length && request.excludedHandles?.length) {
    throw new XSearchError("allowed_handles and excluded_handles cannot be used together.");
  }

  const model = request.model?.trim() || config.model;
  const body: Record<string, unknown> = {
    model,
    input: [{ role: "user", content: request.query }],
    tools: [buildToolConfig(request)],
  };
  if (request.inlineCitations === false) body.include = ["no_inline_citations"];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  const doFetch = await createFetch(config.baseUrl);

  let response: Response;
  try {
    response = await doFetch(`${config.baseUrl}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new XSearchError(
        `xAI request timed out after ${config.timeoutMs}ms. Agentic X search can be slow; raise X_SEARCH_TIMEOUT_MS or narrow the query.`,
      );
    }
    throw new XSearchError(`Could not reach ${config.baseUrl}: ${(error as Error).message}`);
  } finally {
    clearTimeout(timer);
  }

  const raw = await response.text();
  if (!response.ok) {
    throw new XSearchError(errorMessage(response.status, raw));
  }

  let payload: ResponsesPayload;
  try {
    payload = JSON.parse(raw) as ResponsesPayload;
  } catch {
    throw new XSearchError(`xAI returned a non-JSON response: ${raw.slice(0, 300)}`);
  }

  const { text, citations } = extract(payload);
  if (!text) {
    throw new XSearchError(
      `xAI returned no answer text. Raw payload: ${raw.slice(0, 400)}`,
    );
  }

  return { text, citations, model: payload.model ?? model };
}

export function formatResult(result: XSearchResult): string {
  if (result.citations.length === 0) return result.text;
  const sources = result.citations.map((url) => `- ${url}`).join("\n");
  return `${result.text}\n\n**Sources:**\n${sources}`;
}
