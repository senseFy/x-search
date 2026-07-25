#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { createRequire } from "node:module";

import { ConfigError, loadConfig, type Config } from "./config.js";
import { formatResult, XSearchError, xSearch } from "./xai.js";

const { version: VERSION } = createRequire(import.meta.url)("../package.json") as { version: string };
const HANDLE_LIMIT = 20;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const handleList = z
  .array(z.string().min(1).regex(/^@?[A-Za-z0-9_]{1,15}$/, "must be an X handle, e.g. elonmusk"))
  .max(HANDLE_LIMIT);

const inputSchema = {
  query: z
    .string()
    .min(1)
    .describe("What to find on X. Natural language works best, e.g. 'reactions to the Opus 5 launch'."),
  allowed_handles: handleList
    .optional()
    .describe(`Only search these X handles (max ${HANDLE_LIMIT}). Cannot be combined with excluded_handles.`),
  excluded_handles: handleList
    .optional()
    .describe(`Ignore these X handles (max ${HANDLE_LIMIT}). Cannot be combined with allowed_handles.`),
  from_date: z
    .string()
    .regex(ISO_DATE, "use YYYY-MM-DD")
    .optional()
    .describe("Inclusive start date (YYYY-MM-DD)."),
  to_date: z
    .string()
    .regex(ISO_DATE, "use YYYY-MM-DD")
    .optional()
    .describe("Inclusive end date (YYYY-MM-DD)."),
  understand_media: z
    .boolean()
    .optional()
    .describe("Let the agent read images and videos attached to posts. Slower and costs more."),
  inline_citations: z
    .boolean()
    .optional()
    .describe("Embed [[1]](url) markers in the answer text. Defaults to true."),
  model: z
    .string()
    .optional()
    .describe("Override the Grok model driving the search (default from XAI_MODEL, else grok-4.5)."),
};

function stripAt(handles: string[] | undefined): string[] | undefined {
  return handles?.map((handle) => handle.replace(/^@/, ""));
}

function createServer(config: Config): McpServer {
  const server = new McpServer({ name: "x-search-mcp", version: VERSION });

  server.registerTool(
    "x_search",
    {
      title: "Search X (Twitter)",
      description:
        "Search posts, threads and users on X (Twitter) and get an answer with source links. " +
        "Backed by xAI's server-side x_search tool, so it covers real-time content that plain web search misses. " +
        "Use it for public sentiment, launch reactions, breaking news and what specific accounts said.",
      inputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => {
      try {
        const result = await xSearch(config, {
          query: args.query,
          model: args.model,
          allowedHandles: stripAt(args.allowed_handles),
          excludedHandles: stripAt(args.excluded_handles),
          fromDate: args.from_date,
          toDate: args.to_date,
          enableImageUnderstanding: args.understand_media,
          enableVideoUnderstanding: args.understand_media,
          inlineCitations: args.inline_citations,
        });
        return { content: [{ type: "text" as const, text: formatResult(result) }] };
      } catch (error) {
        const message = error instanceof XSearchError ? error.message : (error as Error).message;
        return { isError: true, content: [{ type: "text" as const, text: message }] };
      }
    },
  );

  return server;
}

async function runSmokeTest(config: Config): Promise<void> {
  const query = process.argv[3] ?? "What are people saying about xAI on X today?";
  process.stderr.write(`[x-search-mcp] smoke test with model ${config.model}\n`);
  const result = await xSearch(config, { query });
  process.stdout.write(`${formatResult(result)}\n`);
}

async function main(): Promise<void> {
  let config: Config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`[x-search-mcp] ${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }

  if (process.argv.includes("--version")) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }

  if (process.argv.includes("--smoke")) {
    await runSmokeTest(config);
    return;
  }

  await createServer(config).connect(new StdioServerTransport());
  process.stderr.write(`[x-search-mcp] ready (model: ${config.model})\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`[x-search-mcp] fatal: ${(error as Error).message}\n`);
  process.exit(1);
});
