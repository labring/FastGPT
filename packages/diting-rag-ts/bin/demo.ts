#!/usr/bin/env node
// bin/demo.ts
// Demo - 运行 Agentic Search 测试用例

import * as dotenv from 'dotenv';
import { createAgenticSearch } from '../src/agent/runner';
import { loadConfig, createProviderConfig } from '../src/config/index';
import { createBuiltInProviders, FastGPTVectorSearchProvider } from '../src/adapters/builtIn/index';
import { createBuiltInMixedSearchProvider } from '../src/adapters/builtIn/mixed/index';
import { createLogger, LogLevel } from '../src/ports/logger';

// 加载环境变量
dotenv.config({ path: '.env' });

const DATASET_IDS = ['69b95de08e965a40d7d3102b'];

interface DemoCase {
  name: string;
  question: string;
  chatHistory: Array<{ role: string; content: string }>;
  priorContext: string;
}

const DEMO_QUERIES: DemoCase[] = [
  {
    name: '不相关查询',
    question: '公司有多少员工',
    chatHistory: [],
    priorContext: '[Source <xxx.file>] 公司有8000人'
  },
  {
    name: '简单查询',
    question: '超融合的默认密码是什么',
    chatHistory: [],
    priorContext: 'alias: 超融合, HCI'
  }
  // {
  //   name: '故障排查',
  //   question: 'password reset by usb',
  //   chatHistory: [],
  //   priorContext: ''
  // },
  // {
  //   name: '对比分析',
  //   question: 'vNGAF、vADC 、vIAG 的区别是什么？它们跟vm又有什么不同、',
  //   chatHistory: [],
  //   priorContext: ''
  // },
  // {
  //   name: 'deep_search',
  //   question: 'HCI到目前为止有哪些版本？',
  //   chatHistory: [],
  //   priorContext: ''
  // }
];

async function createProviders() {
  // loadConfig 会自动调用 dotenv.config()，然后尝试加载 config.yaml
  // 如果没有 config.yaml，则只使用环境变量
  const config = await loadConfig();
  const providerConfig = createProviderConfig(config);

  // 创建 logger
  const levelMap: Record<string, LogLevel> = {
    debug: LogLevel.DEBUG,
    info: LogLevel.INFO,
    warn: LogLevel.WARN,
    error: LogLevel.ERROR
  };
  const logLevel = levelMap[(process.env.LOG_LEVEL ?? '').toLowerCase()] ?? LogLevel.INFO;
  const logger = createLogger({
    level: logLevel,
    prefix: 'AgenticRAG'
  });

  logger.info('Loading providers...');
  logger.info(`  LLM: ${providerConfig.llm.model} @ ${providerConfig.llm.endpoint}`);
  logger.info(`  Embed: ${providerConfig.embed.model} @ ${providerConfig.embed.endpoint}`);
  logger.info(
    `  Reranker: ${providerConfig.reranker?.model || 'not configured'} @ ${providerConfig.reranker?.endpoint || 'N/A'}`
  );
  logger.info(`  Vector DB: ${config.vector_db.type} @ ${config.vector_db.pg_url}`);
  logger.info(`  FullText DB: ${config.fulltext_db.type} @ ${config.fulltext_db.url}`);
  logger.info(`  FastGPT: ${config.fastgpt?.base_url || 'not configured'}`);

  // FastGPT Joint Vector Search 需要单独创建（使用已有配置）
  const vsConfig = providerConfig.vectorSearch as Record<string, unknown>;
  const fsConfig = providerConfig.fullTextSearch as Record<string, string>;

  // 使用统一 providers 统一创建，fullTextSearch 传入正确配置
  const providers = createBuiltInProviders({
    logger,
    loggerLevel: 'info',
    llm: {
      apiKey: providerConfig.llm.apiKey,
      endpoint: providerConfig.llm.endpoint,
      model: providerConfig.llm.model,
      timeout: providerConfig.llm.timeout
    },
    embedding: {
      apiKey: providerConfig.embed.apiKey,
      endpoint: providerConfig.embed.endpoint,
      model: providerConfig.embed.model,
      dimension: providerConfig.embed.dimension,
      timeout: providerConfig.embed.timeout
    },
    reranker: providerConfig.reranker
      ? {
          apiKey: providerConfig.reranker.apiKey,
          endpoint: providerConfig.reranker.endpoint,
          model: providerConfig.reranker.model,
          topN: providerConfig.reranker.topN,
          timeout: providerConfig.reranker.timeout
        }
      : undefined,
    fullTextSearch: {
      connectionString: fsConfig.url,
      database: fsConfig.database || 'fastgpt'
    }
  });

  const vectorSearch = new FastGPTVectorSearchProvider({
    pg: {
      connectionString: vsConfig.connectionString as string | undefined,
      host: vsConfig.host as string | undefined,
      port: vsConfig.port as number | undefined,
      database: vsConfig.database as string | undefined,
      user: vsConfig.user as string | undefined,
      password: vsConfig.password as string | undefined,
      vectorDimension: 1536 // FastGPT PG vectors are 1536-dim
    },
    mongodb: {
      connectionString: fsConfig.url,
      database: fsConfig.database || 'fastgpt'
    }
  });
  await vectorSearch.init();

  // 使用统一 providers，但覆盖 vectorSearch 和 fullTextSearch
  // mixedSearch 使用 FastGPTVectorSearchProvider（联合PG+MongoDB内容）+ fullTextSearch + RRF
  const mixedSearch = createBuiltInMixedSearchProvider(
    vectorSearch,
    providers.fullTextSearch,
    logger
  );

  return {
    ...providers,
    vectorSearch,
    fullTextSearch: providers.fullTextSearch,
    mixedSearch
  };
}

/** 将流式事件转为中文用户可读文本（复用 agenticSearch.ts 的展示逻辑） */
function _formatEvent(event: {
  step: string;
  detail?: string;
  extra?: Record<string, unknown>;
}): string {
  switch (event.step) {
    case 'thinking':
      return event.detail ? `${event.detail}\n` : '';
    case 'searching': {
      const queries = (event.extra?.queries as string[] | undefined) ?? [];
      return queries.length > 0 ? `\n检索「${queries.join('、')}」\n` : '\n检索中...\n';
    }
    case 'search_done': {
      const count = event.extra?.chunkCount as number | undefined;
      return count ? `检索到 ${count} 条结果\n` : '';
    }
    case 'rewriting':
      return '\n现有信息不足以完整回答，扩展检索范围...\n';
    case 'rewrite_done': {
      const queries = (event.extra?.queries as string[] | undefined) ?? [];
      return queries.length ? queries.map((q) => `  · ${q}`).join('\n') + '\n' : '';
    }
    case 'reflecting':
      return '\n评估已收集信息的完整性...\n';
    case 'reflect_done':
      return event.detail ? `${event.detail}\n` : '';
    case 'final':
      return event.extra?.refuse ? '知识库中未找到与此问题相关的内容。\n' : '';
    default:
      return '';
  }
}

async function runSingle(agent: ReturnType<typeof createAgenticSearch>, caseData: DemoCase) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`  [${caseData.name}] ${caseData.question}`);
  if (caseData.chatHistory.length > 0) {
    console.log(`  (含 ${caseData.chatHistory.length} 条对话历史)`);
  }
  console.log('─'.repeat(70));

  const start = Date.now();
  try {
    let reasoningText = '';
    let result: Awaited<ReturnType<typeof agent.invoke>> | undefined;

    const stream = agent.stream({
      query: caseData.question,
      datasetIds: DATASET_IDS,
      history: caseData.chatHistory,
      priorContext: caseData.priorContext
    });

    for await (const item of stream) {
      if ('chunks' in item && 'searchCount' in item) {
        result = item as typeof result;
      } else {
        const event = item as { step: string; detail?: string; extra?: Record<string, unknown> };
        const text = _formatEvent(event);
        if (text) reasoningText += text;
      }
    }

    if (!result) throw new Error('No result from stream');

    const elapsed = (Date.now() - start) / 1000;

    console.log('\n# ' + '>'.repeat(60));
    console.log(`  Raw Query:      ${caseData.question}`);
    console.log(`  PriorContext:   ${caseData.priorContext}`);
    console.log(`  Search Queries: ${result.searchQueries.join(', ') || 'N/A'}`);
    console.log(`  Playbook:       ${result.playbook}`);
    console.log(`  Execution Path: ${result.executionPath?.join(' → ') || 'N/A'}`);
    console.log(`  Tool Calls:     ${result.toolCallCount}`);
    console.log(`  Search Count:   ${result.searchCount}`);
    console.log(`  Chunks Found:   ${result.chunks.length}`);
    console.log(`  Confidence:     ${result.confidence?.toFixed(2) || 'N/A'}`);
    console.log(
      `  TTFT:           ${result.ttftMs ? `${(result.ttftMs / 1000.0).toFixed(3)}s` : 'N/A'}`
    );
    console.log(`  Elapsed:        ${elapsed.toFixed(1)}s`);

    if (reasoningText) {
      console.log('\n  ReasoningText:');
      console.log('  ' + '─'.repeat(60));
      reasoningText
        .split('\n')
        .filter(Boolean)
        .forEach((line) => console.log(`  ${line}`));
    }

    if (result.refuse) {
      console.log(`\n  Refuse:         true (no relevant information in knowledge base)`);
    }

    if (result.answer) {
      console.log('\n  Answer:');
      console.log('  ' + '─'.repeat(60));
      const lines = result.answer.split('\n');
      for (const line of lines) {
        console.log(`  ${line}`);
      }
    }
    console.log('# ' + '<'.repeat(60));

    return result;
  } catch (error) {
    const elapsed = (Date.now() - start) / 1000;
    console.log(
      `\n  ERROR (${elapsed.toFixed(1)}s): ${error instanceof Error ? error.message : error}`
    );
    if (error instanceof Error && error.stack) {
      console.log(error.stack);
    }
    return null;
  }
}

async function main() {
  const searchOnly = process.env.SEARCH_ONLY?.toLowerCase() === 'true';

  console.log('='.repeat(70));
  console.log('  DiTing Agentic RAG Demo (TypeScript)');
  console.log('='.repeat(70));

  const providers = await createProviders();

  const agent = createAgenticSearch({ providers, config: { searchOnly } });

  console.log('\n' + '='.repeat(70));
  console.log(`  Datasets:    ${DATASET_IDS.join(', ')}`);
  console.log(`  Mode:        ${searchOnly ? 'searchOnly=true' : 'full (search + answer)'}`);
  console.log(`  Tools:       @search, @answer, @query_rewrite`);
  console.log('='.repeat(70));

  let passed = 0;
  let failed = 0;

  for (const caseData of DEMO_QUERIES) {
    const result = await runSingle(agent, caseData);
    const isRefuseCase = caseData.name === '不相关查询';
    const success =
      result &&
      (isRefuseCase
        ? result.chunks.length === 0
        : searchOnly
          ? result.chunks.length > 0
          : !!result.answer);
    if (success) {
      passed++;
    } else {
      failed++;
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`  Demo 完成: ${passed} 通过, ${failed} 失败, ${DEMO_QUERIES.length} 总计`);
  console.log('='.repeat(70));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
