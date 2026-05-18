/**
 * Agentic Search 功能测试
 * 模拟前端传参，验证 AgenticSearch 能否跑通
 *
 * 运行方式:
 * cd /workspace/projects/sangfor/FastGPT
 * npx vitest run test/cases/service/core/dataset/agenticSearch.test.ts
 *
 * 注意: 需要先确保以下服务正常运行:
 * - MongoDB
 * - PostgreSQL (向量库)
 * - Redis
 * - AI Proxy (LLM 服务)
 */

import { describe, expect, it } from 'vitest';
import { agenticSearchDispatch } from '@fastgpt/service/core/dataset/search/agenticSearch';
import type { SearchDatasetDataProps } from '@fastgpt/service/core/dataset/search/controller';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';

// 测试配置 - 需要根据实际环境修改
const TEST_CONFIG = {
  // 团队 ID - 需要在数据库中存在
  teamId: 'team-id-placeholder',
  // 数据集 ID - 需要在数据库中存在且有数据
  datasetIds: ['dataset-id-placeholder'],
  // Embedding 模型 - 需要在平台配置中存在
  embedModel: 'text-embedding-3-small',
  // LLM 模型 - 需要在 AI Proxy 中可用
  llmModel: 'qwen-max'
};

describe('AgenticSearch 功能测试', () => {
  // 跳过所有测试，除非手动配置了有效的测试参数
  const skipUnlessConfigured = TEST_CONFIG.teamId !== 'team-id-placeholder';

  (skipUnlessConfigured ? it : it.skip)('应该成功执行 Agentic Search 并返回结果', async () => {
    const props: SearchDatasetDataProps = {
      // 模拟前端传入的参数
      histories: [
        {
          role: 'user',
          content: '你好'
        }
      ],
      teamId: TEST_CONFIG.teamId,
      uid: 'test-user-id',
      tmbId: 'test-team-member-id',
      modelId: TEST_CONFIG.embedModel,
      datasetIds: TEST_CONFIG.datasetIds,
      reRankQuery: '什么是 FastGPT？',
      queries: ['什么是 FastGPT？'],
      [NodeInputKeyEnum.datasetMaxTokens]: 3000,
      [NodeInputKeyEnum.datasetSearchMode]: 'embedding' as any
    };

    // 调用 agenticSearchDispatch (模拟前端选择"多轮智能检索"模式)
    const result = await agenticSearchDispatch({
      ...props,
      agenticSearchLLMModelId: TEST_CONFIG.llmModel,
      agenticSearchReasoning: true
    });

    // 验证基本响应结构
    expect(result).toBeDefined();
    expect(result.searchRes).toBeDefined();
    expect(Array.isArray(result.searchRes)).toBe(true);

    // 验证 searchMode 为混合检索
    expect(result.searchMode).toBe('mixedRecall');

    // 验证 agenticSearchResult 存在（因为开启了 outputThinking）
    expect(result.agenticSearchResult).toBeDefined();
    expect(result.agenticSearchResult?.reasoningText).toBeDefined();
    expect(result.agenticSearchResult?.searchCount).toBeGreaterThan(0);

    console.log('=== Agentic Search 测试结果 ===');
    console.log('检索结果数量:', result.searchRes.length);
    console.log('检索轮次:', result.agenticSearchResult?.searchCount);
    console.log('思考过程:', result.agenticSearchResult?.reasoningText?.slice(0, 200) + '...');
  });

  (skipUnlessConfigured ? it : it.skip)(
    '应该成功执行 Agentic Search 并关闭思考过程输出',
    async () => {
      const props: SearchDatasetDataProps = {
        histories: [],
        teamId: TEST_CONFIG.teamId,
        modelId: TEST_CONFIG.embedModel,
        datasetIds: TEST_CONFIG.datasetIds,
        reRankQuery: 'FastGPT 的特点是什么？',
        queries: ['FastGPT 的特点是什么？'],
        [NodeInputKeyEnum.datasetMaxTokens]: 3000
      };

      // 调用 agenticSearchDispatch，关闭思考过程输出
      const result = await agenticSearchDispatch({
        ...props,
        agenticSearchLLMModelId: TEST_CONFIG.llmModel,
        agenticSearchReasoning: false // 关闭思考过程
      });

      // 验证基本响应结构
      expect(result).toBeDefined();
      expect(result.searchRes).toBeDefined();

      // 验证 agenticSearchResult 不包含 reasoningText（因为关闭了输出）
      expect(result.agenticSearchResult).toBeUndefined();

      console.log('=== Agentic Search (关闭思考过程) 测试结果 ===');
      console.log('检索结果数量:', result.searchRes.length);
      console.log('agenticSearchResult:', result.agenticSearchResult);
    }
  );

  (skipUnlessConfigured ? it : it.skip)('应该支持多轮对话历史', async () => {
    // 模拟多轮对话
    const histories = [
      { role: 'user', content: '我想了解 FastGPT' },
      { role: 'assistant', content: 'FastGPT 是一个...' },
      { role: 'user', content: '它支持哪些功能？' }
    ];

    const props: SearchDatasetDataProps = {
      histories: histories as any,
      teamId: TEST_CONFIG.teamId,
      modelId: TEST_CONFIG.embedModel,
      datasetIds: TEST_CONFIG.datasetIds,
      reRankQuery: '它支持哪些功能？',
      queries: ['它支持哪些功能？'],
      [NodeInputKeyEnum.datasetMaxTokens]: 3000
    };

    const result = await agenticSearchDispatch({
      ...props,
      agenticSearchLLMModelId: TEST_CONFIG.llmModel,
      agenticSearchReasoning: true
    });

    // 验证多轮对话能正常处理
    expect(result).toBeDefined();
    expect(result.searchRes).toBeDefined();

    console.log('=== Agentic Search (多轮对话) 测试结果 ===');
    console.log('检索结果数量:', result.searchRes.length);
    console.log('对话历史轮次:', histories.length);
  });

  // 测试降级机制 - 当 Agentic Search 失败时应该降级到普通检索
  (skipUnlessConfigured ? it : it.skip)('应该在 LLM 调用失败时降级到普通检索', async () => {
    const props: SearchDatasetDataProps = {
      histories: [],
      teamId: TEST_CONFIG.teamId,
      modelId: TEST_CONFIG.embedModel,
      datasetIds: TEST_CONFIG.datasetIds,
      reRankQuery: '测试查询',
      queries: ['测试查询'],
      [NodeInputKeyEnum.datasetMaxTokens]: 3000
    };

    // 使用一个不存在的 LLM 模型，模拟调用失败
    const result = await agenticSearchDispatch({
      ...props,
      agenticSearchLLMModelId: 'non-existent-model-12345',
      agenticSearchReasoning: true
    });

    // 验证降级机制：即使失败，也应该返回普通检索结果
    expect(result).toBeDefined();
    expect(result.searchRes).toBeDefined();

    // 降级后不应有 agenticSearchResult（因为实际走的不是 agentic 逻辑）
    // 注意：根据当前实现，降级时仍可能返回结果，但不包含 agenticSearchResult
    console.log('=== Agentic Search 降级机制测试结果 ===');
    console.log('检索结果数量:', result.searchRes.length);
    console.log('agenticSearchResult:', result.agenticSearchResult);
  });
});

// 快速验证测试配置是否有效
describe('测试配置检查', () => {
  it('应该提醒配置测试参数', () => {
    if (TEST_CONFIG.teamId === 'team-id-placeholder') {
      console.log('=== 请配置测试参数 ===');
      console.log('请修改 test/cases/service/core/dataset/agenticSearch.test.ts 中的 TEST_CONFIG');
      console.log('需要:');
      console.log('  1. teamId - 有效的团队 ID');
      console.log('  2. datasetIds - 包含数据的数据集 ID');
      console.log('  3. embedModel - 有效的 Embedding 模型');
      console.log('  4. llmModel - 有效的 LLM 模型');
    }
    // 这个测试始终通过，只是用来打印配置提示
    expect(true).toBe(true);
  });
});
