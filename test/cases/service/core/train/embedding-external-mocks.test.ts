import { describe, test, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to set environment variables before all module imports
vi.hoisted(() => {
  process.env.USE_DITING_MOCK = 'true';
  process.env.USE_SFT_BRIDGE_MOCK = 'true';
  // Set mock SFT endpoint env vars so completed tasks return endpoint info
  process.env.MOCK_SFT_RERANK_ENDPOINT_BASE_URL = 'http://test-sft:8080';
  process.env.MOCK_SFT_RERANK_ENDPOINT_MODEL = 'test-rerank-model';
  process.env.MOCK_SFT_RERANK_ENDPOINT_API_KEY = 'test-api-key';
  process.env.MOCK_SFT_EMBED_ENDPOINT_BASE_URL = 'http://test-sft:8080';
  process.env.MOCK_SFT_EMBED_ENDPOINT_MODEL = 'test-embed-model';
  process.env.MOCK_SFT_EMBED_ENDPOINT_API_KEY = 'test-api-key';
});

import {
  synthesizeEmbeddingTrainDatas,
  synthesizeEmbeddingEvalData,
  evaluateEmbeddingModel,
  createSFTTask,
  querySFTTaskStatus,
  SFTTaskStatus
} from '@fastgpt/service/core/train/embedding/external';

// Mock addLog
vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

describe('Embedding Train External Mocks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('DiTing Service Mocks', () => {
    test('应该成功生成 Embedding 训练数据', async () => {
      const response = await synthesizeEmbeddingTrainDatas({
        samples: [
          {
            datasetId: 'dataset_001',
            dataId: 'data_001',
            q: '什么是向量数据库？',
            a: '向量数据库是专门存储和检索向量嵌入的数据库系统。',
            indexes: [
              ['索引问题1', '索引答案1'],
              ['索引问题2', '索引答案2']
            ]
          },
          {
            datasetId: 'dataset_002',
            dataId: 'data_002',
            q: '什么是语义搜索？',
            a: '语义搜索基于语义相似度而非关键词匹配来检索内容。',
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
      // First sample has 2 pairs (4 docs), second has 1 pair (2 docs), 6 training samples total
      expect(response.data!.length).toBe(6);

      // Verify data structure
      const firstItem = response.data![0];
      expect(typeof firstItem.query).toBe('string');
      expect(firstItem.positive).toBeInstanceOf(Array);
      expect(firstItem.positive.length).toBe(1);
      expect(firstItem.negatives).toBeInstanceOf(Array);
      expect(firstItem.negatives.length).toBeGreaterThanOrEqual(1);
      expect(firstItem.negatives.length).toBeLessThanOrEqual(7);
      expect(typeof firstItem.sourceId).toBe('string');
      expect(typeof firstItem.datasetId).toBe('string');
      expect(firstItem.originalQ).toBeDefined(); // includeOriginalQ=true
      expect(firstItem.metadata).toBeDefined();
    });

    test('生成训练数据时应使用正确的配置', async () => {
      const config = {
        minNegativeSamples: 2,
        maxNegativeSamples: 5,
        includeOriginalQ: false
      };

      const response = await synthesizeEmbeddingTrainDatas({
        samples: [
          {
            datasetId: 'test',
            dataId: 'test',
            q: '测试内容',
            a: '测试答案',
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
      expect(response.data!.length).toBe(6); // 3 pairs × 2 docs = 6 samples
      const firstItem = response.data![0];
      expect(firstItem.negatives.length).toBeGreaterThanOrEqual(config.minNegativeSamples);
      expect(firstItem.negatives.length).toBeLessThanOrEqual(config.maxNegativeSamples);
      expect(firstItem.originalQ).toBeUndefined(); // includeOriginalQ=false
    });

    test('无 indexes 时应回退到 q/a pair 直接生成', async () => {
      const response = await synthesizeEmbeddingTrainDatas({
        samples: [
          {
            datasetId: 'dataset_001',
            dataId: 'data_001',
            q: '锚点文本',
            a: '正例文档',
            indexes: []
          }
        ],
        config: {
          minNegativeSamples: 1,
          maxNegativeSamples: 3,
          includeOriginalQ: true
        }
      });

      expect(response.success).toBe(true);
      expect(response.data!.length).toBe(1);
      const item = response.data![0];
      expect(item.query).toBe('锚点文本');
      expect(item.positive).toContain('正例文档');
      expect(item.sourceId).toBe('data_001');
    });

    test('应该成功生成评测数据集', async () => {
      const { mockSynthesizeEmbeddingEvalData } = await import(
        '@fastgpt/service/core/train/embedding/external/diting/mock'
      );

      const response = await mockSynthesizeEmbeddingEvalData({
        synthesizerConfig: {
          synthesizerName: 'eval_q_a_synthesizer'
        },
        inputData: {
          context: ['向量数据库简介', '向量是高维空间中的点', '余弦相似度用于衡量相似性']
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
      expect(response.usages).toBeDefined();
      expect(response.usages!.length).toBeGreaterThan(0);
    });

    test('应该成功评测 Embedding 模型', async () => {
      const response = await evaluateEmbeddingModel({
        dataset: [
          {
            q: '什么是向量数据库？',
            expected_dataid: ['doc_001', 'doc_002']
          },
          {
            q: '如何计算余弦相似度？',
            expected_dataid: ['doc_003']
          }
        ],
        embedding_config: {
          name: 'bge-m3',
          base_url: 'http://test:8080/v1',
          api_key: 'test-key'
        },
        metric_config: {
          metric_name: 'embed_metric'
        }
      });

      expect(response.success).toBe(true);
      expect(response.requestId).toBeDefined();
      expect(response.status).toBe('success');
      expect(response.data).toBeDefined();
      expect(response.data?.runLogs?.detailed_results).toBeDefined();

      const detailedResults = response.data!.runLogs.detailed_results;
      expect(typeof detailedResults.embed_top5_mrr).toBe('number');
      expect(typeof detailedResults.embed_top10_mrr).toBe('number');
      expect(typeof detailedResults.embed_top5_precision).toBe('number');
      expect(typeof detailedResults.embed_top10_precision).toBe('number');

      // Verify metric ranges [0, 1]
      expect(detailedResults.embed_top5_mrr).toBeGreaterThan(0);
      expect(detailedResults.embed_top5_mrr).toBeLessThanOrEqual(1);
      expect(detailedResults.embed_top10_mrr).toBeGreaterThan(0);
      expect(detailedResults.embed_top10_mrr).toBeLessThanOrEqual(1);
    });

    test('评测结果应包含 retrieval_ranks', async () => {
      const dataset = [
        { q: '问题1', expected_dataid: ['doc_001'] },
        { q: '问题2', expected_dataid: ['doc_002', 'doc_003'] }
      ];

      const response = await evaluateEmbeddingModel({
        dataset,
        embedding_config: { name: 'bge-m3' },
        metric_config: { metric_name: 'embed_metric' }
      });

      expect(response.data?.runLogs.retrieval_ranks).toBeDefined();
      const ranks = response.data!.runLogs.retrieval_ranks!;
      expect(ranks.length).toBe(dataset.length);
      // First query has 1 expected doc → 1 rank
      expect(ranks[0].length).toBe(1);
      // Second query has 2 expected docs → 2 ranks
      expect(ranks[1].length).toBe(2);
      // All ranks should be positive integers
      ranks.forEach((caseRanks) => {
        caseRanks.forEach((rank) => {
          expect(rank).toBeGreaterThan(0);
        });
      });
    });

    test('评测结果应包含 mrr_scores 和 precision_scores', async () => {
      const response = await evaluateEmbeddingModel({
        dataset: [
          { q: '查询1', expected_dataid: ['doc_001'] },
          { q: '查询2', expected_dataid: ['doc_002'] }
        ],
        embedding_config: { name: 'bge-m3' },
        metric_config: { metric_name: 'embed_metric' }
      });

      const runLogs = response.data!.runLogs;
      expect(runLogs.mrr_scores).toBeDefined();
      expect(runLogs.precision_scores).toBeDefined();
      expect(runLogs.total_rows).toBe(2);
      expect(runLogs.expect_count).toBe(2);

      // mrr_scores 应包含 @5/@10/@15
      expect(runLogs.mrr_scores!['mrr@5']).toBeDefined();
      expect(runLogs.mrr_scores!['mrr@10']).toBeDefined();
      // precision_scores 应包含 @5/@10/@15
      expect(runLogs.precision_scores!['precision@5']).toBeDefined();
      expect(runLogs.precision_scores!['precision@10']).toBeDefined();
    });

    test('synthesizeEvalData 应通过 index.ts 路由到 mock', async () => {
      const response = await synthesizeEmbeddingEvalData({
        synthesizerConfig: { synthesizerName: 'eval_q_a_synthesizer' },
        inputData: { context: ['context1', 'context2'] },
        llm_config: { name: 'Qwen3-32B' }
      });

      expect(response.success).toBe(true);
      expect(response.requestId).toBeDefined();
      expect(response.data?.qaPair.question).toBeDefined();
    });
  });

  describe('SFT Bridge Service Mocks (embed taskType)', () => {
    test('应该成功创建 embed 类型的优化任务', async () => {
      const response = await createSFTTask({
        datasetFile: Buffer.from('mock embedding dataset content'),
        taskType: 'embed',
        parameters: {
          learning_rate: 0.0001,
          epochs: 5,
          batch_size: 16
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
        taskType: 'embed',
        parameters: {}
      });

      const statusRes = await querySFTTaskStatus({ taskId: createRes.task_id });

      expect(statusRes.task_id).toBe(createRes.task_id);
      expect(statusRes.status).toBe(SFTTaskStatus.created);
      expect(statusRes.progress).toBe(0);
      expect(statusRes.message).toBeDefined();
    });

    test('任务状态应随时间变化', async () => {
      const createRes = await createSFTTask({
        datasetFile: Buffer.from('test'),
        taskType: 'embed',
        parameters: {}
      });

      // Should enter running state after ~4 seconds
      await new Promise((resolve) => setTimeout(resolve, 4000));
      const runningStatus = await querySFTTaskStatus({ taskId: createRes.task_id });
      expect(runningStatus.status).toBe(SFTTaskStatus.running);
      expect(runningStatus.progress).toBeGreaterThan(0);
      expect(runningStatus.progress).toBeLessThan(80);
    }, 10000);

    test('完成后应该返回 embed endpoint 信息', async () => {
      const createRes = await createSFTTask({
        datasetFile: Buffer.from('test'),
        taskType: 'embed',
        parameters: {}
      });

      // Wait 13 seconds to ensure task completion
      await new Promise((resolve) => setTimeout(resolve, 13000));
      const completedStatus = await querySFTTaskStatus({ taskId: createRes.task_id });

      expect(completedStatus.status).toBe(SFTTaskStatus.completed);
      expect(completedStatus.progress).toBe(100);
      expect(completedStatus.endpoint).toBeDefined();
      // Should use MOCK_SFT_EMBED_ENDPOINT_* vars (not rerank vars)
      expect(completedStatus.endpoint?.model).toBe('test-embed-model');
      expect(completedStatus.endpoint?.base_url).toBe('http://test-sft:8080');
    }, 15000);

    test('embed 和 rerank 任务的 endpoint 应该不同', async () => {
      const [rerankTask, embedTask] = await Promise.all([
        createSFTTask({ datasetFile: Buffer.from('test'), taskType: 'rerank', parameters: {} }),
        createSFTTask({ datasetFile: Buffer.from('test'), taskType: 'embed', parameters: {} })
      ]);

      // Wait for both to complete
      await new Promise((resolve) => setTimeout(resolve, 13000));

      const rerankStatus = await querySFTTaskStatus({ taskId: rerankTask.task_id });
      const embedStatus = await querySFTTaskStatus({ taskId: embedTask.task_id });

      expect(rerankStatus.status).toBe(SFTTaskStatus.completed);
      expect(embedStatus.status).toBe(SFTTaskStatus.completed);

      // Model names should differ based on task type
      expect(rerankStatus.endpoint?.model).toBe('test-rerank-model');
      expect(embedStatus.endpoint?.model).toBe('test-embed-model');
    }, 15000);

    test('查询不存在的任务应返回错误', async () => {
      const response = await querySFTTaskStatus({ taskId: 'non_existent_task_id' });

      expect(response.status).toBe(SFTTaskStatus.failed);
      expect(response.error).toBeDefined();
      expect(response.message).toContain('not found');
    });
  });

  describe('Mock 数据一致性', () => {
    test('DiTing 生成的训练数据应包含源数据 ID', async () => {
      const samples = [
        {
          datasetId: 'ds_1',
          dataId: 'id_1',
          q: '内容1',
          a: '答案1',
          indexes: [
            ['doc_a_q', 'doc_a_a'],
            ['doc_b_q', 'doc_b_a']
          ]
        },
        {
          datasetId: 'ds_1',
          dataId: 'id_2',
          q: '内容2',
          a: '答案2',
          indexes: [['doc_c_q', 'doc_c_a']]
        }
      ];

      const response = await synthesizeEmbeddingTrainDatas({
        samples,
        config: { minNegativeSamples: 1, maxNegativeSamples: 7, includeOriginalQ: true }
      });

      expect(response.data!.length).toBe(6);
      response.data!.forEach((item) => {
        expect(item.sourceId).toBeDefined();
        const found = samples.some((s) => s.dataId === item.sourceId);
        expect(found).toBe(true);
      });
    });

    test('SFT embed 完成任务应返回正确的 endpoint 信息', async () => {
      const createRes = await createSFTTask({
        datasetFile: Buffer.from('test'),
        taskType: 'embed',
        parameters: {}
      });

      await new Promise((resolve) => setTimeout(resolve, 13000));
      const completedStatus = await querySFTTaskStatus({ taskId: createRes.task_id });

      expect(completedStatus.endpoint).toBeDefined();
      expect(completedStatus.endpoint?.model).toBeDefined();
      expect(completedStatus.endpoint?.base_url).toBeDefined();
      expect(completedStatus.endpoint?.api_key).toBeDefined();
    }, 15000);

    test('评测结果的 top5 指标应优于 top10', async () => {
      const response = await evaluateEmbeddingModel({
        dataset: Array.from({ length: 10 }, (_, i) => ({
          q: `查询${i}`,
          expected_dataid: [`doc_${i}`]
        })),
        embedding_config: { name: 'bge-m3' },
        metric_config: { metric_name: 'embed_metric' }
      });

      const d = response.data!.runLogs.detailed_results;
      // top5 MRR >= top10 MRR（更严格的评测指标应更高或相等）
      expect(d.embed_top5_mrr!).toBeGreaterThanOrEqual(d.embed_top10_mrr!);
      expect(d.embed_top5_precision!).toBeGreaterThanOrEqual(d.embed_top10_precision!);
    });
  });
});
