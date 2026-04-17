#!/usr/bin/env node
// bin/cli.ts
// CLI Entry Point - Command line interface for Agentic Search

import { Command } from 'commander';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createAgenticSearch, type AgenticSearchResult } from '../src/agent/runner';
import { createMockProviders } from '../src/testing/index';
import { loadConfig, createProviderConfig } from '../src/config/index';
import {
  createBuiltInLLMProvider,
  createBuiltInEmbeddingProvider,
  createBuiltInRerankProvider,
  createMongoDBProvider,
  FastGPTVectorSearchProvider
} from '../src/adapters/builtIn/index';

// Load environment variables from the package root (where .env lives),
// regardless of the cwd when cli.ts is invoked.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(packageRoot, '.env') });
// Also honor a local .env in cwd (lower priority, already loaded above wins)
dotenv.config();

const program = new Command();

program
  .name('diting-rag')
  .description('Agentic RAG CLI - Intelligent search with LLM-powered routing')
  .version('0.1.0');

/**
 * Create providers from config or CLI options
 */
async function createProviders(options: {
  mock?: boolean;
  configFile?: string;
  model?: string;
  apiKey?: string;
  endpoint?: string;
}) {
  // Use mock providers only when explicitly requested
  if (options.mock) {
    return createMockProviders({
      modelName: options.model || 'qwen3-80b',
      apiKey: options.apiKey,
      endpoint: options.endpoint || 'http://localhost:3000'
    });
  }

  // Default: load from config file / env vars
  try {
    const config = await loadConfig(options.configFile);
    const providerConfig = createProviderConfig(config);

    // Create built-in providers
    const llm = createBuiltInLLMProvider({
      apiKey: providerConfig.llm.apiKey,
      endpoint: providerConfig.llm.endpoint,
      model: providerConfig.llm.model,
      timeout: providerConfig.llm.timeout
    });

    const embed = createBuiltInEmbeddingProvider({
      apiKey: providerConfig.embed.apiKey,
      endpoint: providerConfig.embed.endpoint,
      model: providerConfig.embed.model,
      dimension: providerConfig.embed.dimension,
      timeout: providerConfig.embed.timeout
    });

    const reranker = providerConfig.reranker
      ? createBuiltInRerankProvider({
          apiKey: providerConfig.reranker.apiKey,
          endpoint: providerConfig.reranker.endpoint,
          model: providerConfig.reranker.model,
          topN: providerConfig.reranker.topN,
          timeout: providerConfig.reranker.timeout
        })
      : undefined;

    // Get vectorSearch config and create provider
    const vsConfig = providerConfig.vectorSearch as Record<string, unknown>;
    const fsConfig = providerConfig.fullTextSearch as Record<string, string>;

    // Use FastGPTVectorSearchProvider (same as demo.ts) - handles both PG+MongoDB jointly
    const vectorSearch = new FastGPTVectorSearchProvider({
      pg: {
        connectionString: vsConfig.connectionString as string | undefined,
        host: vsConfig.host as string | undefined,
        port: vsConfig.port as number | undefined,
        database: vsConfig.database as string | undefined,
        user: vsConfig.user as string | undefined,
        password: vsConfig.password as string | undefined,
        vectorDimension: 1536
      },
      mongodb: {
        connectionString: fsConfig.url || 'mongodb://localhost:27017',
        database: fsConfig.database || 'fastgpt'
      }
    });
    await vectorSearch.init();

    const fullTextSearch = createMongoDBProvider({
      connectionString: fsConfig.url || 'mongodb://localhost:27017',
      database: fsConfig.database || 'fastgpt'
    });

    return {
      type: 'custom' as const,
      llm,
      embed,
      vectorSearch,
      fullTextSearch,
      reranker
    };
  } catch (error) {
    console.error('Failed to load config:', error);
    process.exit(1);
  }
}

/**
 * Search command - returns chunks only (search mode)
 */
program
  .command('search')
  .description('Agentic Search: retrieve chunks from knowledge base')
  .requiredOption('-q, --query <text>', 'Search query')
  .requiredOption('-d, --dataset <ids>', 'Dataset ID(s), comma-separated')
  .option('-c, --config <file>', 'Config file path')
  .option('--mock', 'Use mock providers (for testing)', false)
  .option('-m, --model <name>', 'LLM model name (mock mode only)')
  .option('-k, --api-key <key>', 'API key (mock mode only)')
  .option('-e, --endpoint <url>', 'API endpoint (mock mode only)')
  .option('--format <format>', 'Output format: json|human', 'human')
  .action(async (options) => {
    try {
      const providers = await createProviders({
        mock: options.mock,
        configFile: options.config,
        model: options.model,
        apiKey: options.apiKey,
        endpoint: options.endpoint
      });

      const agentic = createAgenticSearch({ providers });

      const datasetIds = (options.dataset as string)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      console.log('\n' + '─'.repeat(70));
      console.log(`  [search] ${options.query}`);
      console.log('─'.repeat(70));
      const start = Date.now();
      const result = await agentic.invoke({
        query: options.query,
        datasetIds
      });
      console.log(`  Elapsed: ${((Date.now() - start) / 1000).toFixed(1)}s`);

      if (options.format === 'json') {
        console.log(
          JSON.stringify(
            {
              playbook: result.playbook,
              searchQueries: result.searchQueries,
              searchCount: result.searchCount,
              chunks: result.chunks.map((c) => ({
                id: c.id,
                content: c.content,
                score: c.score,
                sourceName: c.sourceName
              })),
              executionPath: result.executionPath
            },
            null,
            2
          )
        );
      } else {
        printSearchResult(result);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Ask command - returns chunks + answer (chat mode)
 */
program
  .command('ask')
  .description('Agentic Ask: retrieve chunks and generate answer')
  .requiredOption('-q, --query <text>', 'Question')
  .requiredOption('-d, --dataset <ids>', 'Dataset ID(s), comma-separated')
  .option('-c, --config <file>', 'Config file path')
  .option('--mock', 'Use mock providers (for testing)', false)
  .option('-m, --model <name>', 'LLM model name (mock mode only)')
  .option('-k, --api-key <key>', 'API key (mock mode only)')
  .option('-e, --endpoint <url>', 'API endpoint (mock mode only)')
  .option('--format <format>', 'Output format: json|human', 'human')
  .action(async (options) => {
    try {
      const providers = await createProviders({
        mock: options.mock,
        configFile: options.config,
        model: options.model,
        apiKey: options.apiKey,
        endpoint: options.endpoint
      });

      const agentic = createAgenticSearch({ providers });

      const datasetIds = (options.dataset as string)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      console.log('\n' + '─'.repeat(70));
      console.log(`  [ask] ${options.query}`);
      console.log('─'.repeat(70));
      const start = Date.now();
      const result = await agentic.invoke({
        query: options.query,
        datasetIds
      });
      console.log(`  Elapsed: ${((Date.now() - start) / 1000).toFixed(1)}s`);

      if (options.format === 'json') {
        console.log(
          JSON.stringify(
            {
              query: options.query,
              playbook: result.playbook,
              answer: result.answer,
              confidence: result.confidence,
              searchQueries: result.searchQueries,
              searchCount: result.searchCount,
              toolCallCount: result.toolCallCount,
              chunks: result.chunks.map((c) => ({
                id: c.id,
                content: c.content,
                score: c.score,
                sourceName: c.sourceName
              })),
              executionPath: result.executionPath
            },
            null,
            2
          )
        );
      } else {
        printAskResult(result);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Config command - validate configuration
 */
const configCmd = new Command('config');
configCmd.description('Configuration management');

configCmd
  .command('check')
  .description('Validate configuration file')
  .option('-c, --config <file>', 'Config file path', './config.yaml')
  .action(async (options) => {
    try {
      const config = await loadConfig(options.config || './config.yaml');
      console.log('✓ Configuration is valid');
      console.log('\nCurrent configuration:');
      console.log(`  LLM: ${config.llm.model} @ ${config.llm.base_url}`);
      console.log(
        `  Embedding: ${config.embedding.model} (dimension: ${config.embedding.dimension})`
      );
      console.log(`  Vector DB: ${config.vector_db.type}`);
      console.log(`  FullText DB: ${config.fulltext_db.type} @ ${config.fulltext_db.url}`);
      console.log(`  FastGPT: ${config.fastgpt?.base_url || 'not configured'}`);
      console.log(`  Search Mode: ${config.agent.search_mode}`);
      console.log(`  Max Search Rounds: ${config.agent.max_search_rounds}`);
    } catch (error) {
      console.error('✗ Configuration error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.addCommand(configCmd);

/**
 * Serve command - start HTTP server
 */
program
  .command('serve')
  .description('Start HTTP server for agentic search')
  .option('-p, --port <port>', 'Server port', process.env.PORT || '3000')
  .option('-h, --host <host>', 'Server host', '0.0.0.0')
  .option('-c, --config <file>', 'Config file path')
  .option('--mock', 'Use mock providers (for testing)', false)
  .action(async (options) => {
    const { startServer } = await import('../src/apps/server/index');

    let providers;
    if (!options.mock) {
      try {
        const config = await loadConfig(options.config);
        const providerConfig = createProviderConfig(config);

        const llm = createBuiltInLLMProvider({
          apiKey: providerConfig.llm.apiKey,
          endpoint: providerConfig.llm.endpoint,
          model: providerConfig.llm.model
        });

        const embed = createBuiltInEmbeddingProvider({
          apiKey: providerConfig.embed.apiKey,
          endpoint: providerConfig.embed.endpoint,
          model: providerConfig.embed.model
        });

        const reranker = providerConfig.reranker
          ? createBuiltInRerankProvider({
              apiKey: providerConfig.reranker.apiKey,
              endpoint: providerConfig.reranker.endpoint,
              model: providerConfig.reranker.model
            })
          : undefined;

        const vsConfig = providerConfig.vectorSearch as Record<string, unknown>;
        const fsConfig2 = providerConfig.fullTextSearch as Record<string, string>;

        const vectorSearch = new FastGPTVectorSearchProvider({
          pg: {
            connectionString: vsConfig.connectionString as string | undefined,
            host: vsConfig.host as string | undefined,
            port: vsConfig.port as number | undefined,
            database: vsConfig.database as string | undefined,
            user: vsConfig.user as string | undefined,
            password: vsConfig.password as string | undefined,
            vectorDimension: 1536
          },
          mongodb: {
            connectionString: fsConfig2.url || 'mongodb://localhost:27017',
            database: fsConfig2.database || 'fastgpt'
          }
        });
        await vectorSearch.init();

        const fullTextSearch = createMongoDBProvider({
          connectionString: fsConfig2.url || 'mongodb://localhost:27017',
          database: fsConfig2.database || 'fastgpt'
        });

        providers = { llm, embed, vectorSearch, fullTextSearch, reranker };
      } catch (error) {
        console.error('Failed to load config:', error);
        process.exit(1);
      }
    }

    await startServer({
      port: parseInt(options.port, 10),
      host: options.host,
      providers
    });
  });

/**
 * Print search result (human format) - same style as demo.ts
 */
function printSearchResult(result: AgenticSearchResult): void {
  console.log(`\n  Playbook:       ${result.playbook}`);
  console.log(`  Execution Path: ${result.executionPath?.join(' → ') || 'N/A'}`);
  console.log(`  Tool Calls:     ${result.toolCallCount}`);
  console.log(`  Search Count:   ${result.searchCount}`);
  console.log(`  Search Queries: ${result.searchQueries.join(', ') || 'N/A'}`);
  console.log(`  Chunks Found:   ${result.chunks.length}`);
  console.log(`  Confidence:     ${result.confidence?.toFixed(2) || 'N/A'}`);

  if (result.chunks.length > 0) {
    console.log('\n  Top Chunks:');
    result.chunks.slice(0, 5).forEach((chunk, i) => {
      console.log(
        `\n  [${i + 1}] ${chunk.sourceName || 'unknown'} (score: ${chunk.score.toFixed(3)} rerankScore: ${chunk.rerankScore?.toFixed(3)}) metadata: ${JSON.stringify(chunk.metadata)}`
      );
      console.log('  ' + chunk.content.slice(0, 300) + (chunk.content.length > 300 ? '...' : ''));
    });
  }

  if (result.executionPath?.length) {
    console.log('\n  Execution Path:');
    console.log(result.executionPath.map((e) => `  • ${e}`).join('\n'));
  }
}

/**
 * Print ask result (human format) - same style as demo.ts
 */
function printAskResult(result: AgenticSearchResult): void {
  console.log(`\n  Playbook:       ${result.playbook}`);
  console.log(`  Execution Path: ${result.executionPath?.join(' → ') || 'N/A'}`);
  console.log(`  Tool Calls:     ${result.toolCallCount}`);
  console.log(`  Search Count:   ${result.searchCount}`);
  console.log(`  Search Queries: ${result.searchQueries.join(', ') || 'N/A'}`);
  console.log(`  Chunks Found:   ${result.chunks.length}`);
  console.log(`  Confidence:     ${result.confidence?.toFixed(2) || 'N/A'}`);

  if (result.answer) {
    console.log('\n  Answer:');
    console.log('  ' + '─'.repeat(60));
    for (const line of result.answer.split('\n')) {
      console.log(`  ${line}`);
    }
    console.log('  ' + '─'.repeat(60));
  }

  if (result.executionPath?.length) {
    console.log('\n  Execution Path:');
    console.log(result.executionPath.map((e) => `  • ${e}`).join('\n'));
  }
}

// Parse and execute
program
  .parseAsync()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
