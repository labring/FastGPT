import { describe, test, expect, vi, beforeEach } from 'vitest';

// 使用 vi.hoisted 确保在所有模块导入之前设置环境变量
vi.hoisted(() => {
  process.env.USE_DITING_MOCK = 'true';
  process.env.USE_SFT_BRIDGE_MOCK = 'true';
});

import {
  syntheticRerankTrainDatas,
  syntheticRerankEvalData,
  evaluateRerank,
  createSFTTask,
  querySFTTaskStatus,
  SFTTaskStatus
} from '@fastgpt/service/core/train/rerank/external';

// Mock addLog
vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

describe('Rerank Train External Mocks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('DiTing Service Mocks', () => {
    test('应该成功生成 Rerank 训练数据', async () => {
      const response = await syntheticRerankTrainDatas({
        samples: [
          {
            datasetId: 'dataset_001',
            dataId: 'data_001',
            q: '这是测试内容1',
            a: '这是答案1',
            // 使用 synthesis 类型的 string[][] 格式（2对=4个训练样本）
            indexes: [
              ['索引问题1', '索引答案1'],
              ['索引问题2', '索引答案2']
            ]
          },
          {
            datasetId: 'dataset_002',
            dataId: 'data_002',
            q: '这是测试内容2',
            a: '这是答案2',
            // 1对=2个训练样本
            indexes: [['索引问题3', '索引答案3']]
          }
        ],
        config: {
          minNegativeSamples: 1,
          maxNegativeSamples: 7,
          includeOriginalQ: true
        }
      });

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(Array.isArray(response.data)).toBe(true);
      // 第一个sample有2对(4个文档)，第二个sample有1对(2个文档)，共6个训练样本
      expect(response.data!.length).toBe(6);

      // 验证数据结构
      const firstItem = response.data![0];
      expect(typeof firstItem.query).toBe('string'); // query 是字符串
      expect(firstItem.positive).toBeInstanceOf(Array);
      expect(firstItem.positive.length).toBe(1); // positive 通常长度为1
      expect(firstItem.negatives).toBeInstanceOf(Array);
      expect(firstItem.negatives.length).toBeGreaterThanOrEqual(1);
      expect(firstItem.negatives.length).toBeLessThanOrEqual(7);
      expect(typeof firstItem.sourceId).toBe('string');
      expect(typeof firstItem.datasetId).toBe('string');
      expect(firstItem.originalQ).toBeDefined(); // includeOriginalQ=true
      expect(firstItem.metadata).toBeDefined();
    });

    test('应该成功生成评测数据集', async () => {
      // 直接导入底层 DiTing API mock 函数
      const { mockSynthesizeRerankEvalData } = await import(
        '@fastgpt/service/core/train/rerank/external/diting/mock'
      );

      const response = await mockSynthesizeRerankEvalData({
        synthesizerConfig: {
          synthesizerName: 'eval_q_a_synthesizer'
        },
        inputData: {
          context: ['Question 1', 'Answer 1', 'Question 2', 'Answer 2']
        },
        llm_config: {
          name: 'Qwen3-32B',
          timeout: 30
        }
      });

      expect(response.success).toBe(true);
      expect(response.requestId).toBeDefined();
      expect(typeof response.requestId).toBe('string');
      expect(response.status).toBe('success');
      expect(response.data?.qaPair).toBeDefined();
      expect(response.data?.qaPair.question).toBeDefined();
      expect(response.data?.qaPair.answer).toBeDefined();
    });

    test('应该成功评测 Rerank 模型', async () => {
      const response = await evaluateRerank({
        dataset: [
          {
            q: '测试问题',
            retrieval_reference_list: [
              {
                id: '68fecc566d93adba6a4c0207',
                q: '什么是HCI超融合基础设施？',
                a: '',
                score: [
                  {
                    type: 'fullText',
                    value: 1.5555555555555556,
                    index: 0
                  }
                ]
              }
            ],
            expected_dataid: ['68fecc566d93adba6a4c0207']
          }
        ],
        reranker_config: {
          name: 'qwen3-reranker-06b'
        },
        metric_config: {
          metric_name: 'rerank_metric'
        }
      });

      expect(response.success).toBe(true);
      expect(response.requestId).toBeDefined();
      expect(response.status).toBe('success');
      expect(response.data).toBeDefined();
      expect(response.data?.runLogs?.detailed_results).toBeDefined();

      const detailedResults = response.data!.runLogs.detailed_results;
      expect(typeof detailedResults.rerank_top10_ndcg).toBe('number');
      expect(typeof detailedResults.rerank_top10_mrr).toBe('number');
      expect(typeof detailedResults.rerank_top10_precision).toBe('number');
      expect(typeof detailedResults.rerank_top10_recall).toBe('number');

      // 验证指标范围
      expect(detailedResults.rerank_top10_ndcg).toBeGreaterThan(0);
      expect(detailedResults.rerank_top10_ndcg).toBeLessThanOrEqual(1);
      expect(detailedResults.rerank_top10_mrr).toBeGreaterThan(0);
      expect(detailedResults.rerank_top10_mrr).toBeLessThanOrEqual(1);
    });

    test('生成训练数据时应使用正确的配置', async () => {
      const config = {
        minNegativeSamples: 2,
        maxNegativeSamples: 5,
        includeOriginalQ: false,
        model: 'test-model',
        temperature: 0.5
      };

      const response = await syntheticRerankTrainDatas({
        samples: [
          {
            datasetId: 'test',
            dataId: 'test',
            q: 'test content',
            a: 'test answer',
            // 使用 synthesis 格式：3对=6个文档
            indexes: [
              ['doc1_q', 'doc1_a'],
              ['doc2_q', 'doc2_a'],
              ['doc3_q', 'doc3_a']
            ]
          }
        ],
        config
      });

      expect(response.success).toBe(true);
      expect(response.data!.length).toBe(6); // 3对索引 = 6个文档
      const firstItem = response.data![0];
      expect(firstItem.negatives.length).toBeGreaterThanOrEqual(config.minNegativeSamples);
      expect(firstItem.negatives.length).toBeLessThanOrEqual(config.maxNegativeSamples);
      expect(firstItem.originalQ).toBeUndefined(); // includeOriginalQ=false
    });
  });

  describe('SFT Bridge Service Mocks', () => {
    test('应该成功创建优化任务', async () => {
      const response = await createSFTTask({
        datasetFile: Buffer.from('mock dataset content'),
        taskType: 'rerank',
        parameters: {
          learning_rate: 0.001,
          epochs: 10,
          batch_size: 32
        }
      });

      expect(response.task_id).toBeDefined();
      expect(typeof response.task_id).toBe('string');
      expect(response.task_id.length).toBeGreaterThan(0);
      expect(response.status).toBe('created');
      expect(response.message).toBeDefined();
    });

    test('应该立即查询到 created 状态', async () => {
      const createRes = await createSFTTask({
        datasetFile: Buffer.from('test'),
        taskType: 'rerank',
        parameters: {}
      });

      const statusRes = await querySFTTaskStatus({ taskId: createRes.task_id });

      expect(statusRes.task_id).toBe(createRes.task_id);
      expect(statusRes.status).toBe(SFTTaskStatus.created);
      expect(statusRes.progress).toBeDefined();
      expect(typeof statusRes.progress).toBe('number');
      expect(statusRes.progress).toBe(0);
      expect(statusRes.message).toBeDefined();
    });

    test('任务状态应随时间变化', async () => {
      const createRes = await createSFTTask({
        datasetFile: Buffer.from('test'),
        taskType: 'rerank',
        parameters: {}
      });

      // 等待 4 秒后应该进入 running 状态
      await new Promise((resolve) => setTimeout(resolve, 4000));
      const runningStatus = await querySFTTaskStatus({ taskId: createRes.task_id });
      expect(runningStatus.status).toBe(SFTTaskStatus.running);
      expect(runningStatus.progress).toBeGreaterThan(0);
      expect(runningStatus.progress).toBeLessThan(80);
    }, 10000); // 增加测试超时时间

    test('完成后应该返回 endpoint 信息', async () => {
      const createRes = await createSFTTask({
        datasetFile: Buffer.from('test'),
        taskType: 'rerank',
        parameters: {}
      });

      // 等待 13 秒确保任务完成
      await new Promise((resolve) => setTimeout(resolve, 13000));
      const completedStatus = await querySFTTaskStatus({ taskId: createRes.task_id });

      expect(completedStatus.status).toBe(SFTTaskStatus.completed);
      expect(completedStatus.progress).toBe(100);
      expect(completedStatus.endpoint).toBeDefined();
      expect(completedStatus.endpoint?.base_url).toBeDefined();
      expect(completedStatus.endpoint?.model).toBeDefined();
      expect(completedStatus.endpoint?.api_key).toBeDefined();
    }, 15000); // 增加测试超时时间

    test('查询不存在的任务应返回错误', async () => {
      const response = await querySFTTaskStatus({ taskId: 'non_existent_task_id' });

      expect(response.status).toBe(SFTTaskStatus.failed);
      expect(response.error).toBeDefined();
      expect(response.message).toBeDefined();
      expect(response.message).toContain('not found');
    });

    test('不同任务类型应被正确记录', async () => {
      const rerankTask = await createSFTTask({
        datasetFile: Buffer.from('test'),
        taskType: 'rerank',
        parameters: {}
      });

      const embedTask = await createSFTTask({
        datasetFile: Buffer.from('test'),
        taskType: 'embed',
        parameters: {}
      });

      expect(rerankTask.task_id).not.toBe(embedTask.task_id);

      const rerankStatus = await querySFTTaskStatus({ taskId: rerankTask.task_id });
      const embedStatus = await querySFTTaskStatus({ taskId: embedTask.task_id });

      expect(rerankStatus.status).toBe(SFTTaskStatus.created);
      expect(embedStatus.status).toBe(SFTTaskStatus.created);
    });
  });

  describe('Mock 数据一致性', () => {
    test('DiTing 生成的训练数据应包含源数据 ID', async () => {
      const samples = [
        {
          datasetId: 'id_1',
          dataId: 'id_1',
          q: 'content 1',
          a: 'answer 1',
          // 2对 synthesis indexes
          indexes: [
            ['doc_a_q', 'doc_a_a'],
            ['doc_b_q', 'doc_b_a']
          ]
        },
        {
          datasetId: 'id_1',
          dataId: 'id_2',
          q: 'content 2',
          a: 'answer 2',
          // 1对 synthesis indexes
          indexes: [['doc_c_q', 'doc_c_a']]
        }
      ];

      const response = await syntheticRerankTrainDatas({
        samples,
        config: {
          minNegativeSamples: 1,
          maxNegativeSamples: 7,
          includeOriginalQ: true
        }
      });

      // 第一个sample有2对(4个文档)，第二个有1对(2个文档)，共6个训练样本
      expect(response.data!.length).toBe(6);
      response.data!.forEach((item) => {
        expect(item.sourceId).toBeDefined();
        // sourceId 应该来自输入的 samples
        const found = samples.some((s) => s.dataId === item.sourceId);
        expect(found).toBe(true);
      });
    });

    test('SFT 完成的任务应返回 endpoint 信息', async () => {
      const createRes = await createSFTTask({
        datasetFile: Buffer.from('test'),
        taskType: 'rerank',
        parameters: {}
      });

      await new Promise((resolve) => setTimeout(resolve, 13000));
      const completedStatus = await querySFTTaskStatus({ taskId: createRes.task_id });

      // 只验证 endpoint 存在且包含必要字段，不验证具体值（mock 返回值可能变化）
      expect(completedStatus.endpoint).toBeDefined();
      expect(completedStatus.endpoint?.model).toBeDefined();
    }, 15000);
  });
});
