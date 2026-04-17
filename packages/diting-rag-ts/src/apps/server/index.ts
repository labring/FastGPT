// src/apps/server/index.ts
// HTTP Server - Hono-based REST API for Agentic Search

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { createAgenticSearch, type AgenticSearchResult } from '../../agent/runner';
import type { AgenticSearchProviders, AgenticSearchConfig } from '../../ports/agentic';

/**
 * Server options
 */
export interface ServerOptions {
  port: number;
  host: string;
  providers?: AgenticSearchProviders;
  config?: AgenticSearchConfig;
}

/**
 * API request body
 */
export interface SearchRequest {
  query: string;
  datasetIds: string[];
  history?: Array<{ role: string; content: string }>;
  config?: Partial<AgenticSearchConfig>;
}

/**
 * API response
 */
export interface SearchResponse {
  success: boolean;
  data?: AgenticSearchResult;
  error?: string;
}

/**
 * Create server app
 */
export function createApp(options: {
  providers: AgenticSearchProviders;
  config?: AgenticSearchConfig;
}) {
  const app = new Hono();

  // Middleware
  app.use('*', logger());
  app.use(
    '*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization']
    })
  );

  // Health check
  app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

  // Create agentic search instance
  const agentic = createAgenticSearch({
    providers: options.providers,
    config: options.config
  });

  /**
   * POST /v1/agentic/search - Synchronous search
   */
  app.post('/v1/agentic/search', async (c) => {
    try {
      const body = await c.req.json<SearchRequest>();

      if (!body.query || !body.datasetIds) {
        return c.json<SearchResponse>(
          {
            success: false,
            error: 'Missing required fields: query, datasetIds'
          },
          400
        );
      }

      const result = await agentic.invoke({
        query: body.query,
        datasetIds: body.datasetIds,
        history: body.history
      });

      return c.json<SearchResponse>({
        success: true,
        data: result
      });
    } catch (error) {
      return c.json<SearchResponse>(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        500
      );
    }
  });

  /**
   * POST /v1/agentic/stream - Streaming search (SSE)
   */
  app.post('/v1/agentic/stream', async (c) => {
    try {
      const body = await c.req.json<SearchRequest>();

      if (!body.query || !body.datasetIds) {
        return c.json<SearchResponse>(
          {
            success: false,
            error: 'Missing required fields: query, datasetIds'
          },
          400
        );
      }

      // Set up SSE headers
      c.header('Content-Type', 'text/event-stream');
      c.header('Cache-Control', 'no-cache');
      c.header('Connection', 'keep-alive');

      // Create SSE stream
      const eventStream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          try {
            const asyncStream = agentic.stream({
              query: body.query,
              datasetIds: body.datasetIds,
              history: body.history
            });

            for await (const event of asyncStream) {
              const data = `data: ${JSON.stringify(event)}\n\n`;
              controller.enqueue(encoder.encode(data));
            }
          } catch (e) {
            const errorData = `data: ${JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' })}\n\n`;
            controller.enqueue(encoder.encode(errorData));
          }
          controller.close();
        }
      });

      return c.body(eventStream);
    } catch (error) {
      return c.json<SearchResponse>(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        500
      );
    }
  });

  /**
   * GET /v1/agentic/playbooks - List available playbooks
   */
  app.get('/v1/agentic/playbooks', (c) => {
    return c.json({
      playbooks: [
        { name: 'simple_query', description: 'Simple single-turn query' },
        { name: 'comparative_analysis', description: 'Compare multiple options' },
        { name: 'troubleshooting', description: 'Troubleshoot problems' },
        { name: 'deep_research', description: 'Comprehensive research' },
        { name: 'followup_query', description: 'Follow-up on previous query' }
      ]
    });
  });

  return app;
}

/**
 * Start server - returns the Hono app (user can run with any Node.js server)
 */
export async function startServer(
  options: ServerOptions
): Promise<{ app: Hono; info: { port: number; host: string; url: string } }> {
  const { createMockProviders } = await import('../../testing/index');

  // Create default providers (should be replaced with real FastGPT providers)
  const providers =
    options.providers ||
    createMockProviders({
      modelName: 'qwen3-80b',
      apiKey: process.env.FASTGPT_API_KEY || 'test',
      endpoint: process.env.FASTGPT_ENDPOINT || 'http://localhost:3000'
    });

  const app = createApp({ providers, config: options.config });

  const info = {
    port: options.port,
    host: options.host,
    url: `http://${options.host}:${options.port}`
  };

  const logger = providers.logger;
  logger?.info(`Starting server on ${info.url}...`);
  logger?.info(
    'Endpoints: GET /health, POST /v1/agentic/search, POST /v1/agentic/stream, GET /v1/agentic/playbooks'
  );

  return { app, info };
}
