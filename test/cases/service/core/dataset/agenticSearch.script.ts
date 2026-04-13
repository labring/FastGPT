/**
 * Agentic Search 独立测试脚本
 * 不依赖 vitest 测试框架，直接调用 agenticSearchDispatch
 *
 * 运行方式:
 * cd /workspace/projects/sangfor/FastGPT
 * pnpm exec tsx test/cases/service/core/dataset/agenticSearch.script.ts
 *
 * 或者:
 * npx tsx test/cases/service/core/dataset/agenticSearch.script.ts
 *
 * 注意: 需要先确保以下服务正常运行:
 * - MongoDB
 * - PostgreSQL (向量库)
 * - Redis
 * - AI Proxy (LLM 服务)
 */

import { agenticSearchDispatch } from '../../service/core/dataset/search/agenticSearch';
import type { SearchDatasetDataProps } from '../../service/core/dataset/search/controller';
import { NodeInputKeyEnum } from '../../global/core/workflow/constants';

// 测试配置 - 需要根据实际环境修改
const TEST_CONFIG = {
  // 团队 ID - 从环境变量读取或使用占位符
  teamId: process.env.TEST_TEAM_ID || 'team-id-placeholder',
  // 数据集 ID - 从环境变量读取或使用占位符
  datasetIds: process.env.TEST_DATASET_IDS?.split(',') || ['dataset-id-placeholder'],
  // Embedding 模型
  embedModel: process.env.TEST_EMBED_MODEL || 'text-embedding-3-small',
  // LLM 模型
  llmModel: process.env.TEST_LLM_MODEL || 'qwen-max',
  // Rerank 模型（可选）
  rerankModel: process.env.TEST_RERANK_MODEL || ''
};

async function main() {
  console.log('=== Agentic Search 测试脚本 ===\n');

  // 检查配置
  if (TEST_CONFIG.teamId === 'team-id-placeholder') {
    console.log('⚠️  请配置测试参数后再运行:\n');
    console.log('  export TEST_TEAM_ID=你的团队ID');
    console.log('  export TEST_DATASET_IDS=dataset1,dataset2');
    console.log('  export TEST_EMBED_MODEL=text-embedding-3-small');
    console.log('  export TEST_LLM_MODEL=qwen-max\n');
    console.log(
      '  然后运行: pnpm exec tsx test/cases/service/core/dataset/agenticSearch.script.ts\n'
    );
    return;
  }

  console.log('测试配置:');
  console.log(`  Team ID: ${TEST_CONFIG.teamId}`);
  console.log(`  Dataset IDs: ${TEST_CONFIG.datasetIds.join(', ')}`);
  console.log(`  Embed Model: ${TEST_CONFIG.embedModel}`);
  console.log(`  LLM Model: ${TEST_CONFIG.llmModel}`);
  console.log(`  Rerank Model: ${TEST_CONFIG.rerankModel || '(未配置)'}`);
  console.log('');

  try {
    // 测试 1: 基本 Agentic Search
    await testBasicAgenticSearch();

    // 测试 2: 关闭思考过程输出
    await testWithoutThinking();

    // 测试 3: 多轮对话
    await testMultiTurnConversation();

    // 测试 4: 使用 Rerank 模型
    if (TEST_CONFIG.rerankModel) {
      await testWithRerankModel();
    } else {
      console.log('--- 测试 4: Rerank 模型 (已跳过，未配置 TEST_RERANK_MODEL) ---\n');
    }

    console.log('\n✅ 所有测试完成!');
  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    process.exit(1);
  }
}

async function testBasicAgenticSearch() {
  console.log('--- 测试 1: 基本 Agentic Search ---\n');

  const props: SearchDatasetDataProps = {
    histories: [
      {
        role: 'user',
        content: '你好'
      }
    ],
    teamId: TEST_CONFIG.teamId,
    uid: 'test-user-id',
    tmbId: 'test-team-member-id',
    model: TEST_CONFIG.embedModel,
    datasetIds: TEST_CONFIG.datasetIds,
    reRankQuery: '什么是 FastGPT？',
    queries: ['什么是 FastGPT？'],
    [NodeInputKeyEnum.datasetMaxTokens]: 3000
  };

  const startTime = Date.now();

  try {
    const result = await agenticSearchDispatch({
      ...props,
      agenticSearchLLMModel: TEST_CONFIG.llmModel,
      agenticSearchReasoning: true
    });

    const duration = Date.now() - startTime;

    console.log(`✅ 成功! 耗时: ${duration}ms`);
    console.log(`  检索结果数量: ${result.searchRes.length}`);
    console.log(`  搜索模式: ${result.searchMode}`);

    if (result.agenticSearchResult) {
      console.log(`  检索轮次: ${result.agenticSearchResult.searchCount}`);
      console.log(`  工具调用次数: ${result.agenticSearchResult.toolCallCount}`);
      console.log(`  思考过程长度: ${result.agenticSearchResult.reasoningText?.length || 0} 字符`);
      if (result.agenticSearchResult.reasoningText) {
        console.log(`  思考过程预览: ${result.agenticSearchResult.reasoningText.slice(0, 200)}...`);
      }
    } else {
      console.log(`  ⚠️  无 agenticSearchResult (可能降级到普通检索)`);
    }

    console.log('');
  } catch (error) {
    console.log(`❌ 失败: ${error}`);
    console.log('');
  }
}

async function testWithoutThinking() {
  console.log('--- 测试 2: 关闭思考过程输出 ---\n');

  const props: SearchDatasetDataProps = {
    histories: [],
    teamId: TEST_CONFIG.teamId,
    model: TEST_CONFIG.embedModel,
    datasetIds: TEST_CONFIG.datasetIds,
    reRankQuery: 'FastGPT 的特点是什么？',
    queries: ['FastGPT 的特点是什么？'],
    [NodeInputKeyEnum.datasetMaxTokens]: 3000
  };

  try {
    const result = await agenticSearchDispatch({
      ...props,
      agenticSearchLLMModel: TEST_CONFIG.llmModel,
      agenticSearchReasoning: false // 关闭思考过程
    });

    console.log(`✅ 成功!`);
    console.log(`  检索结果数量: ${result.searchRes.length}`);

    if (result.agenticSearchResult) {
      console.log(`  ⚠️  意外: 关闭思考过程但仍有 agenticSearchResult`);
    } else {
      console.log(`  ✅ 正确: 关闭思考过程后无 agenticSearchResult`);
    }

    console.log('');
  } catch (error) {
    console.log(`❌ 失败: ${error}`);
    console.log('');
  }
}

async function testMultiTurnConversation() {
  console.log('--- 测试 3: 多轮对话 ---\n');

  const histories = [
    { role: 'user' as const, content: '我想了解 FastGPT' },
    { role: 'assistant' as const, content: 'FastGPT 是一个开源的...' },
    { role: 'user' as const, content: '它支持哪些功能？' }
  ];

  const props: SearchDatasetDataProps = {
    histories: histories as any,
    teamId: TEST_CONFIG.teamId,
    model: TEST_CONFIG.embedModel,
    datasetIds: TEST_CONFIG.datasetIds,
    reRankQuery: '它支持哪些功能？',
    queries: ['它支持哪些功能？'],
    [NodeInputKeyEnum.datasetMaxTokens]: 3000
  };

  try {
    const result = await agenticSearchDispatch({
      ...props,
      agenticSearchLLMModel: TEST_CONFIG.llmModel,
      agenticSearchReasoning: true
    });

    console.log(`✅ 成功!`);
    console.log(`  对话历史轮次: ${histories.length}`);
    console.log(`  检索结果数量: ${result.searchRes.length}`);

    if (result.agenticSearchResult) {
      console.log(`  检索轮次: ${result.agenticSearchResult.searchCount}`);
    }

    console.log('');
  } catch (error) {
    console.log(`❌ 失败: ${error}`);
    console.log('');
  }
}

async function testWithRerankModel() {
  console.log('--- 测试 4: 指定 Rerank 模型 ---\n');

  const props: SearchDatasetDataProps = {
    histories: [],
    teamId: TEST_CONFIG.teamId,
    model: TEST_CONFIG.embedModel,
    datasetIds: TEST_CONFIG.datasetIds,
    reRankQuery: 'FastGPT 的核心功能',
    queries: ['FastGPT 的核心功能'],
    [NodeInputKeyEnum.datasetMaxTokens]: 3000
  };

  try {
    const result = await agenticSearchDispatch({
      ...props,
      agenticSearchLLMModel: TEST_CONFIG.llmModel,
      agenticSearchRerankModel: TEST_CONFIG.rerankModel,
      agenticSearchReasoning: true
    });

    console.log(`✅ 成功!`);
    console.log(`  检索结果数量: ${result.searchRes.length}`);
    if (result.agenticSearchResult) {
      console.log(`  检索轮次: ${result.agenticSearchResult.searchCount}`);
      console.log(`  工具调用次数: ${result.agenticSearchResult.toolCallCount}`);
    }
    console.log('');
  } catch (error) {
    console.log(`❌ 失败: ${error}`);
    console.log('');
  }
}

// 运行测试
main();
