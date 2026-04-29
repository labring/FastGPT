// test/integration/irrelevant_query_early_stop.test.ts
//
// 验证"完全不相关 query"场景下三层协同早停机制：
// Layer 1: Blackboard 引导（prompt 中注入 ⚠️ 信号）
// Layer 2: 路由兜底（consecutiveIrrelevantSearches 达阈值）
// Layer 3: chunk_selector 门控（allChunksIrrelevant → 允许返回 []）
//
// 使用全 mock providers，不依赖真实网络。
import { describe, it, expect } from 'vitest';
import { createAgenticSearch } from '../../src/agent/runner';
import { MockLLMProvider } from '../../src/adapters/mock/llm';
import { MockVectorSearchProvider } from '../../src/adapters/mock/vector_search';
import { MockFullTextSearchProvider } from '../../src/adapters/mock/full_text_search';
import { MockEmbeddingProvider } from '../../src/adapters/mock/embedding';
import type { ChunkResult } from '../../src/types/chunk';

// 模拟 NGFW 知识库中的 chunks，分数极低（与腾讯员工无关）
const NGFW_CHUNKS_LOW_SCORE: ChunkResult[] = [
  {
    id: 'chunk-ngfw-001',
    content: 'NGFW 防火墙策略配置说明。在企业网络中，防火墙用于控制进出流量...',
    score: 0.05,
    datasetId: 'ngfw-dataset',
    sourceName: 'NGFW配置手册'
  },
  {
    id: 'chunk-ngfw-002',
    content: 'NGFW 版本升级步骤：1. 备份配置文件 2. 上传升级包 3. 执行升级...',
    score: 0.04,
    datasetId: 'ngfw-dataset',
    sourceName: 'NGFW升级手册'
  },
  {
    id: 'chunk-ngfw-003',
    content: '防火墙会话表管理：会话表记录了所有经过防火墙的连接状态信息...',
    score: 0.06,
    datasetId: 'ngfw-dataset',
    sourceName: 'NGFW运维手册'
  }
];

function buildProviders(llmResponses: string[], chunks: ChunkResult[] = NGFW_CHUNKS_LOW_SCORE) {
  return {
    llm: new MockLLMProvider({ responses: llmResponses }),
    vectorSearch: new MockVectorSearchProvider(chunks),
    fullTextSearch: new MockFullTextSearchProvider(chunks),
    embed: new MockEmbeddingProvider()
    // 不传 reranker → enableRerank=false → 使用原始 vector score（保持低分）
  };
}

describe('Irrelevant Query Early Stop', () => {
  it('[search_only] 单次不相关搜索后即停，返回空 chunks', async () => {
    // search_only 模式：threshold=1，1 次不相关即路由到 select_chunks
    const providers = buildProviders([
      // 1. route_playbook LLM 调用
      '{"playbook": "simple_query"}',
      // 2. agent 第一次调用，执行 @search
      '@search({"query": "腾讯有多少员工"})',
      // 3-5. Stage 1 subQueryFilter LLM 评分（3 个 chunk 并发）
      '1',
      '1',
      '1'
      // text_agent(2) → 循环到 response 1 = playbook JSON → 无 tool calls → select_chunks
    ]);

    const agent = createAgenticSearch({
      providers,
      config: {
        searchOnly: true,
        maxSearchCalls: 5,
        maxToolCalls: 10,
        maxIterations: 20
      },
      mode: 'text'
    });

    const result = await agent.invoke({
      query: '腾讯有多少员工',
      datasetIds: ['ngfw-dataset']
    });

    // search_only threshold=1: 1 次不相关搜索后 routing 截断
    expect(result.searchCount).toBe(1);
    // chunk_selector allChunksIrrelevant gate: 返回空 chunks
    expect(result.chunks.length).toBe(0);
  });

  it('[normal mode] 两次不相关搜索后路由截断，返回 refuse', async () => {
    // 普通模式：threshold=2，agent LLM 两次调 @search，路由兜底截断
    // 使用 general playbook 避免 simpleQuerySearchCappedWithCtx 干扰
    const providers = buildProviders([
      // 1. route_playbook → general playbook（general 不触发 simpleQuerySearchCapped）
      '{"playbook": "general"}',
      // 2. agent 第一次调用 → @search
      '@search({"query": "腾讯有多少员工"})',
      // 3. agent 第二次调用（consecutiveIrrelevantSearches=1 < 2，给一次语义机会）→ @search
      '@search({"query": "Tencent employee count"})'
      // routing 在此截断（consecutiveIrrelevantSearches=2 >= threshold=2）
      // 进入 select_chunks → generate_answer(no_relevant_chunks) → refuse
    ]);

    const agent = createAgenticSearch({
      providers,
      config: {
        searchOnly: false,
        maxSearchCalls: 5,
        maxToolCalls: 10,
        maxIterations: 20
      },
      mode: 'text'
    });

    const result = await agent.invoke({
      query: '腾讯有多少员工',
      datasetIds: ['ngfw-dataset']
    });

    // 两次搜索后 routing 截断
    expect(result.searchCount).toBe(2);
    // generate_answer(no_relevant_chunks) 路径
    expect(result.refuse).toBe(true);
    // 有 answer 文本（refuse 消息）
    expect(result.answer).toBeTruthy();
    expect(result.answer).toContain('No relevant information');
  });

  it('[normal mode] 相关 query 不触发早停', async () => {
    // 提供高分 chunks，验证相关 query 不误触早停
    // 使用 searchOnly=true 避免 generate_answer LLM 调用复杂性
    const relevantChunks: ChunkResult[] = [
      {
        id: 'chunk-r-001',
        content: 'NGFW 防火墙的默认管理员密码是 admin，首次登录需修改...',
        score: 0.85,
        datasetId: 'ngfw-dataset',
        sourceName: 'NGFW快速入门'
      },
      {
        id: 'chunk-r-002',
        content: 'NGFW 登录界面说明：通过浏览器访问 https://192.168.1.1 进入管理界面...',
        score: 0.78,
        datasetId: 'ngfw-dataset',
        sourceName: 'NGFW管理手册'
      }
    ];

    const providers = buildProviders(
      [
        '{"playbook": "simple_query"}',
        '@search({"query": "NGFW 默认密码"})'
        // simpleQuerySearchCappedWithCtx 会在高分命中后直接路由到 select_chunks
        // 无需第三个 LLM 响应（searchOnly=true 时 select_chunks 后直接结束）
      ],
      relevantChunks
    );

    const agent = createAgenticSearch({
      providers,
      config: {
        searchOnly: true,
        maxSearchCalls: 5,
        maxToolCalls: 10,
        maxIterations: 20
      },
      mode: 'text'
    });

    const result = await agent.invoke({
      query: 'NGFW 默认密码是什么',
      datasetIds: ['ngfw-dataset']
    });

    // 相关 query：consecutiveIrrelevantSearches 应始终为 0，不触发不相关早停
    expect(result.refuse).not.toBe(true);
    expect(result.searchCount).toBeGreaterThanOrEqual(1);
    // 相关 query 应该返回 chunks（非空）
    expect(result.chunks.length).toBeGreaterThan(0);
  });
});
