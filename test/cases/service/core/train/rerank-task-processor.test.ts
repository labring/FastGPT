import { describe, test, expect, vi, beforeEach } from 'vitest';
import { rerankTrainTaskProcessor } from '@fastgpt/service/core/train/rerank/task/processor';
import {
  updateTaskStatus,
  updateCheckpointStage,
  updateCheckpointData,
  getRerankTrainTask,
  deleteRerankTrainTask
} from '@fastgpt/service/core/train/rerank/task/controller';
import {
  RerankTrainTaskStatusEnum,
  RerankTaskCheckpointStageEnum
} from '@fastgpt/global/core/train/rerank/constants';
import type { RerankTrainTaskSchemaType } from '@fastgpt/global/core/train/rerank/type';
import * as fs from 'fs';

// Mock dependencies
vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/train/rerank/task/controller', () => ({
  updateTaskStatus: vi.fn(),
  updateCheckpointStage: vi.fn(),
  updateCheckpointData: vi.fn(),
  getRerankTrainTask: vi.fn(),
  deleteRerankTrainTask: vi.fn()
}));

vi.mock('@fastgpt/service/core/train/rerank/data/schema', () => ({
  MongoRerankTrainsetData: {
    find: vi.fn().mockReturnValue({
      cursor: vi.fn()
    })
  }
}));

vi.mock('@fastgpt/service/core/ai/model', () => ({
  createRerankModelConfig: vi.fn(),
  getDefaultLLMModel: vi.fn(),
  getRerankModel: vi.fn()
}));

vi.mock('@fastgpt/service/core/train/rerank/model/controller', () => ({
  createRerankModelConfig: vi.fn(),
  deleteRerankModelConfig: vi.fn()
}));

// Mock channel 模块
vi.mock('@fastgpt/service/core/train/rerank/task/helpers/channel', () => ({
  createTunedModelChannel: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('@fastgpt/service/core/train/rerank/task/schema', () => ({
  MongoRerankTrainTask: {
    updateOne: vi.fn(),
    findById: vi.fn(),
    findOne: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/train/rerank/trainset/schema', () => ({
  MongoRerankTrainset: {
    findById: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/train/rerank/data/controller', () => ({
  calculateTrainsetStats: vi.fn()
}));

vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/app/version/schema', () => ({
  MongoAppVersion: {
    create: vi.fn()
  }
}));

vi.mock('@fastgpt/service/common/mongo/sessionRun', () => ({
  mongoSessionRun: vi.fn((callback) => callback({ session: null }))
}));

vi.mock('@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema', () => ({
  MongoEvalDatasetCollection: {
    create: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema', () => ({
  MongoEvalDatasetData: {
    create: vi.fn(),
    insertMany: vi.fn(),
    find: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/train/rerank/external', () => ({
  createSFTTask: vi.fn(),
  querySFTTaskStatus: vi.fn(),
  syntheticRerankEvalData: vi.fn(),
  evaluateRerank: vi.fn(),
  SFTTaskStatus: {
    pending: 'pending',
    running: 'running',
    completed: 'completed',
    failed: 'failed'
  }
}));

vi.mock('fs', () => {
  const mockWriteStream = {
    write: vi.fn(),
    end: vi.fn((callback?: (err?: Error) => void) => {
      if (callback) callback();
    })
  };

  return {
    createWriteStream: vi.fn(() => mockWriteStream),
    promises: {
      writeFile: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockResolvedValue(Buffer.from('test data')),
      unlink: vi.fn().mockResolvedValue(undefined)
    },
    // 同时导出同步版本
    writeFile: vi.fn(),
    readFile: vi.fn(),
    unlink: vi.fn()
  };
});

// 单独 mock fs/promises 以支持直接导入 'fs/promises' 的代码
vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from('test data')),
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('@fastgpt/service/core/train/rerank/utils', async () => {
  const actual = await vi.importActual('@fastgpt/service/core/train/rerank/utils');
  return {
    ...actual,
    sampleDataFromDataset: vi.fn()
  };
});

vi.mock('@fastgpt/service/core/workflow/dispatch/dataset/search', () => ({
  dispatchDatasetSearch: vi.fn()
}));

import type { AppSchema } from '@fastgpt/global/core/app/type';

describe('Rerank Train Task Processor', () => {
  const mockTaskId = 'task_123';
  const mockAppId = 'app_123';
  const mockTeamId = 'team_123';
  const mockTmbId = 'tmb_123';

  const createMockTask = (
    status: string = RerankTrainTaskStatusEnum.pending,
    stage: string | null = null,
    checkpointData: any = {}
  ): Partial<RerankTrainTaskSchemaType> => ({
    _id: mockTaskId,
    appId: mockAppId,
    trainsetId: 'trainset_123',
    teamId: mockTeamId,
    tmbId: mockTmbId,
    name: 'Test Rerank Task',
    baseModelConfigId: 'base_model_123',
    baseModelEndpoint: {
      base_url: 'http://example.com/v1',
      api_key: 'test-key',
      model: 'base-model'
    },
    status: status as any,
    checkpoint: {
      stage: stage as any,
      data: checkpointData,
      stageEndTime: {}
    },
    createTime: new Date(),
    updateTime: new Date()
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    // 设置测试环境变量
    process.env.AIPROXY_API_ENDPOINT = 'http://test-aiproxy.com';
    process.env.AIPROXY_API_TOKEN = 'test-token';
    // Set short polling intervals for faster tests
    process.env.SFT_BRIDGE_POLL_INTERVAL = '100'; // 100ms instead of 60s
    process.env.SFT_BRIDGE_MAX_POLLS = '10'; // Reduce max polls

    // Mock trainset is ready by default
    const { MongoRerankTrainset } = await import(
      '@fastgpt/service/core/train/rerank/trainset/schema'
    );
    const { calculateTrainsetStats } = await import(
      '@fastgpt/service/core/train/rerank/data/controller'
    );

    (MongoRerankTrainset.findById as any).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: 'trainset_123',
        status: 'ready'
      })
    });

    (calculateTrainsetStats as any).mockResolvedValue({
      dataCount: 10,
      positiveCount: 10,
      negativeCount: 50,
      sourceSummary: []
    });

    // 设置默认的 sampleDataFromDataset mock
    const { sampleDataFromDataset } = await import('@fastgpt/service/core/train/rerank/utils');
    (sampleDataFromDataset as any).mockResolvedValue([
      {
        datasetId: 'dataset_001',
        dataId: 'data_001',
        q: 'Test query 1',
        a: 'Test answer 1',
        indexes: [{ type: 'custom', dataId: 'idx_001', text: 'Test context 1' }]
      },
      {
        datasetId: 'dataset_002',
        dataId: 'data_002',
        q: 'Test query 2',
        a: 'Test answer 2',
        indexes: [{ type: 'custom', dataId: 'idx_002', text: 'Test context 2' }]
      }
    ]);
  });

  describe('rerankTrainTaskProcessor', () => {
    test('应该成功执行完整的训练任务流程', async () => {
      const { updateTaskStatus, updateCheckpointStage, updateCheckpointData, getRerankTrainTask } =
        await import('@fastgpt/service/core/train/rerank/task/controller');
      const { MongoRerankTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/data/schema'
      );
      const { createRerankModelConfig } = await import(
        '@fastgpt/service/core/train/rerank/model/controller'
      );
      const { createSFTTask, querySFTTaskStatus, syntheticRerankEvalData, evaluateRerank } =
        await import('@fastgpt/service/core/train/rerank/external');

      // Mock initial task
      const mockTask = createMockTask();
      (getRerankTrainTask as any).mockResolvedValue(mockTask);

      // Mock train data
      const mockTrainData = [
        {
          _id: 'data_1',
          trainsetId: 'trainset_1',
          query: 'query 1',
          positiveDocs: ['doc 1', 'doc 2'],
          negativeDocs: ['doc 3', 'doc 4']
        },
        {
          _id: 'data_2',
          trainsetId: 'trainset_1', // Same trainsetId to test deduplication
          query: 'query 3',
          positiveDocs: ['doc 5'],
          negativeDocs: ['doc 6']
        }
      ];
      // Mock cursor() 返回异步迭代器
      (MongoRerankTrainsetData.find as any).mockReturnValue({
        cursor: vi.fn().mockReturnValue({
          async *[Symbol.asyncIterator]() {
            for (const item of mockTrainData) {
              yield item;
            }
          }
        })
      });

      // Mock SFT Bridge operations
      (createSFTTask as any).mockResolvedValue({
        task_id: 'sft_task_123'
      });
      (querySFTTaskStatus as any).mockResolvedValue({
        task_id: 'sft_task_123',
        status: 'completed',
        endpoint: {
          base_url: 'http://sft-bridge.com/v1',
          model: 'tuned-model',
          api_key: 'sft-brige-key'
        }
      });

      // Mock model creation
      (createRerankModelConfig as any).mockResolvedValue('config_123');

      // Mock application and version operations
      const { MongoApp } = await import('@fastgpt/service/core/app/schema');
      const { MongoAppVersion } = await import('@fastgpt/service/core/app/version/schema');

      // Mock app with datasetSearchNode and chatNode (for AI model extraction)
      const mockApp = {
        _id: mockAppId,
        modules: [
          {
            flowNodeType: 'chatNode',
            inputs: [
              {
                key: 'model',
                value: 'gpt-4'
              }
            ]
          },
          {
            flowNodeType: 'datasetSearchNode',
            inputs: [
              {
                key: 'rerankModel',
                value: 'base_model_123'
              },
              {
                key: 'datasets',
                value: [{ datasetId: 'dataset_001' }, { datasetId: 'dataset_002' }]
              }
            ]
          }
        ],
        edges: [],
        chatConfig: {},
        pluginData: {
          nodeVersion: null
        }
      };

      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockApp)
      });
      (MongoApp.findByIdAndUpdate as any).mockResolvedValue(undefined);
      (MongoAppVersion.create as any).mockResolvedValue([
        {
          _id: 'version_123'
        }
      ]);

      // Mock evaluation dataset collections
      const { MongoEvalDatasetCollection } = await import(
        '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema'
      );
      const { MongoEvalDatasetData } = await import(
        '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema'
      );
      (MongoEvalDatasetCollection.create as any).mockResolvedValue([
        {
          _id: 'eval_dataset_123',
          teamId: mockTeamId,
          tmbId: mockTmbId,
          name: 'Test Eval Collection'
        }
      ]);
      (MongoEvalDatasetData.insertMany as any).mockResolvedValue([
        {
          _id: 'eval_data_123',
          collectionId: 'eval_dataset_123'
        }
      ]);

      // Mock MongoEvalDatasetData.find 用于评测阶段
      (MongoEvalDatasetData.find as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            userInput: 'Test eval question',
            retrievalContextsFull: [
              {
                id: 'data_001',
                q: 'Test question 1',
                a: 'Test answer 1',
                score: [{ type: 'fullText', value: 1.5, index: 0 }]
              }
            ],
            expectedContextIds: ['data_001']
          }
        ])
      });

      // Mock getRerankModel
      const { getRerankModel } = await import('@fastgpt/service/core/ai/model');
      (getRerankModel as any).mockReturnValue({
        model: 'test-rerank-model',
        requestUrl: 'http://test.com',
        requestAuth: 'test-api-key'
      });

      // Mock evaluation
      (syntheticRerankEvalData as any).mockResolvedValue({
        success: true,
        data: {
          qaPair: {
            question: 'Test eval question',
            answer: 'Test eval answer'
          }
        }
      });
      (evaluateRerank as any).mockResolvedValue({
        success: true,
        data: {
          runLogs: {
            detailed_results: {
              rerank_top10_ndcg: 0.85,
              rerank_top10_mrr: 0.9,
              rerank_top10_precision: 0.82,
              rerank_top10_recall: 0.78
            }
          }
        }
      });

      // Mock dataset search
      const { dispatchDatasetSearch } = await import(
        '@fastgpt/service/core/workflow/dispatch/dataset/search'
      );
      (dispatchDatasetSearch as any).mockResolvedValue({
        data: {
          quoteQA: [
            {
              id: 'data_001',
              q: 'Test question 1',
              a: 'Test answer 1',
              score: [{ type: 'embedding', value: 0.95, index: 0 }]
            }
          ]
        }
      });

      // Mock task updates with proper data evolution
      let taskState = { ...mockTask };
      const checkpointData: any = {};

      (getRerankTrainTask as any).mockImplementation(async (id: string) => {
        if (id === mockTaskId) {
          return Promise.resolve({
            ...taskState,
            checkpoint: {
              ...taskState.checkpoint,
              data: { ...checkpointData }
            }
          });
        }
        return Promise.resolve(null);
      });

      // Mock checkpoint data updates to simulate real database operations
      (updateCheckpointData as any).mockImplementation(
        async (taskId: string, stage: string, data: any, merge: boolean = false) => {
          if (merge) {
            checkpointData[stage] = { ...checkpointData[stage], ...data };
          } else {
            checkpointData[stage] = data;
          }
          return Promise.resolve();
        }
      );

      await rerankTrainTaskProcessor({
        data: {
          taskId: mockTaskId,
          isRetry: false
        },
        attemptsMade: 0,
        opts: {
          attempts: 3
        }
      } as any);

      // 验证状态更新
      expect(updateTaskStatus).toHaveBeenCalledWith(mockTaskId, RerankTrainTaskStatusEnum.running);

      // 验证阶段执行顺序
      expect(updateCheckpointStage).toHaveBeenNthCalledWith(
        1,
        mockTaskId,
        RerankTaskCheckpointStageEnum.preparing
      );
      expect(updateCheckpointStage).toHaveBeenNthCalledWith(
        2,
        mockTaskId,
        RerankTaskCheckpointStageEnum.finetuning
      );
      expect(updateCheckpointStage).toHaveBeenNthCalledWith(
        3,
        mockTaskId,
        RerankTaskCheckpointStageEnum.registering
      );
      expect(updateCheckpointStage).toHaveBeenNthCalledWith(
        4,
        mockTaskId,
        RerankTaskCheckpointStageEnum.evaluating
      );
      expect(updateCheckpointStage).toHaveBeenNthCalledWith(
        5,
        mockTaskId,
        RerankTaskCheckpointStageEnum.applying
      );

      // 验证数据准备阶段
      expect(fs.createWriteStream).toHaveBeenCalled();
      expect(MongoRerankTrainsetData.find).toHaveBeenCalledWith({
        trainsetId: 'trainset_123'
      });

      // 验证微调阶段
      expect(createSFTTask).toHaveBeenCalled();
      expect(querySFTTaskStatus).toHaveBeenCalledWith({
        taskId: 'sft_task_123'
      });

      // 验证注册阶段 - 使用 tunedModelConfigId 作为 name
      expect(createRerankModelConfig).toHaveBeenCalledWith({
        name: 'tuned-model', // 直接使用 tunedModelConfigId 作为名称
        endpoint: {
          base_url: 'http://sft-bridge.com/v1',
          api_key: 'sft-brige-key',
          model: 'tuned-model'
        },
        isActive: true,
        charsPointsPrice: 0
      });

      // 验证评测阶段
      expect(syntheticRerankEvalData).toHaveBeenCalledTimes(2); // 只调用2次（对2个样本各调用一次，只生成一份数据集）
      expect(evaluateRerank).toHaveBeenCalledTimes(2);

      // 验证最终结果保存包含完整的评测数据
      // 验证 checkpointData.evaluating 包含了完整的数据演进过程
      expect(checkpointData.evaluating).toBeDefined();
      expect(checkpointData.evaluating.evalDatasetId).toBe('eval_dataset_123');
      expect(checkpointData.evaluating.baseModelEvalResult).toEqual({
        detailed_results: {
          rerank_top10_ndcg: 0.85,
          rerank_top10_mrr: 0.9,
          rerank_top10_precision: 0.82,
          rerank_top10_recall: 0.78
        }
      });
      expect(checkpointData.evaluating.tunedModelEvalResult).toEqual({
        detailed_results: {
          rerank_top10_ndcg: 0.85,
          rerank_top10_mrr: 0.9,
          rerank_top10_precision: 0.82,
          rerank_top10_recall: 0.78
        }
      });

      // 验证应用更新阶段
      expect(checkpointData.applying).toBeDefined();
      expect(checkpointData.applying.versionId).toBe('version_123');
      expect(checkpointData.applying.versionName).toContain('Fine-tuned');
      expect(checkpointData.applying.previousModelConfigId).toBe('base_model_123');
      expect(checkpointData.applying.updatedNodesCount).toBe(1);

      // 验证最终结果保存
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );
      expect(MongoRerankTrainTask.updateOne).toHaveBeenCalledWith(
        { _id: mockTaskId },
        {
          result: {
            trainDatasetId: expect.any(String),
            trainDatasetFilePath: expect.any(String),
            tunedModelConfigId: 'tuned-model',
            evalDatasetId: 'eval_dataset_123',
            baseModelEvalResult: {
              detailed_results: {
                rerank_top10_ndcg: 0.85,
                rerank_top10_mrr: 0.9,
                rerank_top10_precision: 0.82,
                rerank_top10_recall: 0.78
              }
            },
            tunedModelEvalResult: {
              detailed_results: {
                rerank_top10_ndcg: 0.85,
                rerank_top10_mrr: 0.9,
                rerank_top10_precision: 0.82,
                rerank_top10_recall: 0.78
              }
            },
            // 应用更新结果
            versionId: 'version_123',
            versionName: expect.any(String),
            previousModelConfigId: 'base_model_123',
            previousTaskId: '',
            updatedNodesCount: 1
          }
        }
      );
    });

    test('应该正确处理重试逻辑', async () => {
      const { updateTaskStatus, updateCheckpointStage, updateCheckpointData, getRerankTrainTask } =
        await import('@fastgpt/service/core/train/rerank/task/controller');

      // Mock a task that completed preparing stage and should start finetuning on retry
      let taskState = createMockTask(
        RerankTrainTaskStatusEnum.running,
        RerankTaskCheckpointStageEnum.preparing, // preparing已完成
        {
          preparing: {
            trainDatasetId: 'data_1',
            trainDatasetFilePath: '/tmp/test.jsonl'
          }
          // 注意：没有finetuning数据，因为还没执行
        }
      );
      const checkpointData: any = {
        preparing: {
          trainDatasetId: 'trainset_1', // Updated to training set ID
          trainDatasetFilePath: '/tmp/test.jsonl'
        }
        // 注意：没有finetuning数据，准备开始执行
      };

      (getRerankTrainTask as any).mockImplementation(async (id: string) => {
        if (id === mockTaskId) {
          return Promise.resolve({
            ...taskState,
            checkpoint: {
              ...taskState.checkpoint,
              data: { ...checkpointData }
            }
          });
        }
        return Promise.resolve(null);
      });
      (updateCheckpointStage as any).mockResolvedValue(undefined);

      // Mock checkpoint data updates to simulate real database operations
      (updateCheckpointData as any).mockImplementation(
        async (taskId: string, stage: string, data: any, merge: boolean = false) => {
          if (merge) {
            checkpointData[stage] = { ...checkpointData[stage], ...data };
          } else {
            checkpointData[stage] = data;
          }
          return Promise.resolve();
        }
      );

      // Mock SFT success
      const { querySFTTaskStatus } = await import('@fastgpt/service/core/train/rerank/external');
      (querySFTTaskStatus as any).mockResolvedValue({
        task_id: 'sft_task_123',
        status: 'completed',
        endpoint: {
          base_url: 'http://sft-bridge.com/v1',
          model: 'tuned-model',
          api_key: 'sft-bridge-key'
        }
      });

      // Mock application and version operations
      const { MongoApp } = await import('@fastgpt/service/core/app/schema');
      const { MongoAppVersion } = await import('@fastgpt/service/core/app/version/schema');

      // Mock app with datasetSearchNode and chatNode (for AI model extraction)
      const mockApp = {
        _id: mockAppId,
        modules: [
          {
            flowNodeType: 'chatNode',
            inputs: [
              {
                key: 'model',
                value: 'gpt-4'
              }
            ]
          },
          {
            flowNodeType: 'datasetSearchNode',
            inputs: [
              {
                key: 'rerankModel',
                value: 'base_model_123'
              },
              {
                key: 'datasets',
                value: [{ datasetId: 'dataset_001' }, { datasetId: 'dataset_002' }]
              }
            ]
          }
        ],
        edges: [],
        chatConfig: {},
        pluginData: {
          nodeVersion: null
        }
      };

      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockApp)
      });
      (MongoApp.findByIdAndUpdate as any).mockResolvedValue(undefined);
      (MongoAppVersion.create as any).mockResolvedValue([
        {
          _id: 'version_123'
        }
      ]);

      // Mock remaining stages succeed
      const { syntheticRerankEvalData, evaluateRerank } = await import(
        '@fastgpt/service/core/train/rerank/external'
      );
      const { createRerankModelConfig } = await import(
        '@fastgpt/service/core/train/rerank/model/controller'
      );
      (createRerankModelConfig as any).mockResolvedValue('config_123');

      // Mock evaluation dataset collections
      const { MongoEvalDatasetCollection } = await import(
        '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema'
      );
      const { MongoEvalDatasetData } = await import(
        '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema'
      );
      (MongoEvalDatasetCollection.create as any).mockResolvedValue([
        {
          _id: 'eval_dataset_123',
          teamId: mockTeamId,
          tmbId: mockTmbId,
          name: 'Test Eval Collection'
        }
      ]);
      (MongoEvalDatasetData.insertMany as any).mockResolvedValue([
        {
          _id: 'eval_data_123',
          collectionId: 'eval_dataset_123'
        }
      ]);

      // Mock MongoEvalDatasetData.find 用于评测阶段
      if (!(MongoEvalDatasetData.find as any).mock) {
        (MongoEvalDatasetData.find as any).mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            {
              userInput: 'Test eval question',
              retrievalContextsFull: [
                {
                  id: 'data_001',
                  q: 'Test question 1',
                  a: 'Test answer 1',
                  score: [{ type: 'fullText', value: 1.5, index: 0 }]
                }
              ],
              expectedContextIds: ['data_001']
            }
          ])
        });
      }

      // Mock getRerankModel
      const { getRerankModel } = await import('@fastgpt/service/core/ai/model');
      if (!(getRerankModel as any).mock) {
        (getRerankModel as any).mockReturnValue({
          model: 'test-rerank-model',
          requestUrl: 'http://test.com',
          requestAuth: 'test-api-key'
        });
      }

      (syntheticRerankEvalData as any).mockResolvedValue({
        success: true,
        data: {
          qaPair: {
            question: 'Test eval question',
            answer: 'Test eval answer'
          }
        }
      });
      (evaluateRerank as any).mockResolvedValue({
        success: true,
        data: {
          runLogs: {
            detailed_results: {
              rerank_top10_ndcg: 0.85,
              rerank_top10_mrr: 0.9,
              rerank_top10_precision: 0.82,
              rerank_top10_recall: 0.78
            }
          }
        }
      });

      await rerankTrainTaskProcessor({
        data: {
          taskId: mockTaskId,
          isRetry: true
        },
        attemptsMade: 1,
        opts: {
          attempts: 3
        }
      } as any);

      // 验证重试时的阶段执行逻辑（跳过已完成的阶段，执行后续阶段）
      // 由于 shouldRunStage 现在使用 > 关系，preparing 阶段会被跳过
      expect(updateCheckpointStage).not.toHaveBeenCalledWith(
        mockTaskId,
        RerankTaskCheckpointStageEnum.preparing
      );
      expect(updateCheckpointStage).toHaveBeenCalledWith(
        mockTaskId,
        RerankTaskCheckpointStageEnum.finetuning
      );
      expect(updateCheckpointStage).toHaveBeenCalledWith(
        mockTaskId,
        RerankTaskCheckpointStageEnum.registering
      );
      expect(updateCheckpointStage).toHaveBeenCalledWith(
        mockTaskId,
        RerankTaskCheckpointStageEnum.evaluating
      );
      expect(updateCheckpointStage).toHaveBeenCalledWith(
        mockTaskId,
        RerankTaskCheckpointStageEnum.applying
      );

      // 验证最终结果保存
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );
      expect(MongoRerankTrainTask.updateOne).toHaveBeenCalledWith(
        { _id: mockTaskId },
        {
          result: {
            trainDatasetId: 'trainset_1', // 使用原有的 preparing 数据，不重新生成
            trainDatasetFilePath: '/tmp/test.jsonl', // 使用原有的 preparing 数据，不重新生成
            tunedModelConfigId: 'tuned-model',
            evalDatasetId: 'eval_dataset_123',
            baseModelEvalResult: {
              detailed_results: {
                rerank_top10_ndcg: 0.85,
                rerank_top10_mrr: 0.9,
                rerank_top10_precision: 0.82,
                rerank_top10_recall: 0.78
              }
            },
            tunedModelEvalResult: {
              detailed_results: {
                rerank_top10_ndcg: 0.85,
                rerank_top10_mrr: 0.9,
                rerank_top10_precision: 0.82,
                rerank_top10_recall: 0.78
              }
            },
            // 应用更新结果
            versionId: 'version_123',
            versionName: expect.any(String),
            previousModelConfigId: 'base_model_123',
            previousTaskId: '',
            updatedNodesCount: 1
          }
        }
      );
    });

    test('应该正确处理checkpoint数据更新后重新获取任务', async () => {
      const { updateTaskStatus, updateCheckpointStage, updateCheckpointData, getRerankTrainTask } =
        await import('@fastgpt/service/core/train/rerank/task/controller');
      const { MongoRerankTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/data/schema'
      );

      // Mock initial task
      const mockTask = createMockTask();
      (getRerankTrainTask as any).mockResolvedValue(mockTask);

      // Mock train data - 使用 cursor() 返回异步迭代器
      const mockTrainData = [
        {
          _id: 'data_1',
          trainsetId: 'trainset_123',
          query: 'test',
          positiveDocs: ['positive'],
          negativeDocs: ['negative']
        }
      ];
      (MongoRerankTrainsetData.find as any).mockReturnValue({
        cursor: vi.fn().mockReturnValue({
          async *[Symbol.asyncIterator]() {
            for (const item of mockTrainData) {
              yield item;
            }
          }
        })
      });

      (fs.writeFile as any).mockResolvedValue(undefined);

      // Mock task updates after each checkpoint update
      let callCount = 0;
      (getRerankTrainTask as any).mockImplementation((id: string) => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(mockTask); // Initial call
        } else if (callCount === 2) {
          // After preparing stage - should have checkpoint data
          return Promise.resolve({
            ...mockTask,
            checkpoint: {
              ...mockTask.checkpoint,
              stage: RerankTaskCheckpointStageEnum.preparing,
              data: {
                preparing: {
                  trainDatasetId: 'trainset_123', // Updated to training set ID
                  trainDatasetFilePath: '/tmp/test.jsonl'
                }
              }
            }
          });
        }
        return Promise.resolve(mockTask);
      });

      // Mock SFT operations to fail quickly for this test
      const { createSFTTask } = await import('@fastgpt/service/core/train/rerank/external');
      (createSFTTask as any).mockRejectedValue(new Error('SFT error'));

      await expect(
        rerankTrainTaskProcessor({
          data: {
            taskId: mockTaskId,
            isRetry: false
          },
          attemptsMade: 0,
          opts: {
            attempts: 3
          }
        } as any)
      ).rejects.toThrow('SFT error');

      // 验证确实在finetuning阶段重新获取了任务数据
      expect(getRerankTrainTask).toHaveBeenCalledTimes(2); // Initial + after preparing
      expect(updateCheckpointData).toHaveBeenCalledWith(
        mockTaskId,
        'preparing',
        expect.objectContaining({
          trainDatasetId: 'trainset_123' // Now correctly expects training set ID, not data ID
        })
        // 注意：不需要验证 merge 参数，因为它是默认值 false
      );
    });

    test('应该处理没有训练数据的情况', async () => {
      const { getRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/controller'
      );
      const { MongoRerankTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/data/schema'
      );

      const mockTask = createMockTask();
      (getRerankTrainTask as any).mockResolvedValue(mockTask);

      // Mock empty train data - cursor() 返回空的异步迭代器
      (MongoRerankTrainsetData.find as any).mockReturnValue({
        cursor: vi.fn().mockReturnValue({
          async *[Symbol.asyncIterator]() {
            // 空迭代器
          }
        })
      });

      await expect(
        rerankTrainTaskProcessor({
          data: {
            taskId: mockTaskId,
            isRetry: false
          },
          attemptsMade: 0,
          opts: {
            attempts: 3
          }
        } as any)
      ).rejects.toThrow('Training data is empty');
    });

    test('应该正确处理文件清理', async () => {
      const {
        updateTaskStatus,
        updateCheckpointStage,
        updateCheckpointData,
        getRerankTrainTask,
        deleteRerankTrainTask
      } = await import('@fastgpt/service/core/train/rerank/task/controller');
      const { MongoRerankTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/data/schema'
      );

      // Use data evolution pattern like other tests
      let taskState = createMockTask();
      const checkpointData: any = {};

      (getRerankTrainTask as any).mockImplementation(async (id: string) => {
        if (id === mockTaskId) {
          return Promise.resolve({
            ...taskState,
            checkpoint: {
              ...taskState.checkpoint,
              data: { ...checkpointData }
            }
          });
        }
        return Promise.resolve(null);
      });

      const mockTrainData = [
        {
          _id: 'data_1',
          trainsetId: 'trainset_1',
          query: 'test',
          positiveDocs: ['positive'],
          negativeDocs: ['negative']
        }
      ];
      (MongoRerankTrainsetData.find as any).mockReturnValue({
        cursor: vi.fn().mockReturnValue({
          async *[Symbol.asyncIterator]() {
            for (const item of mockTrainData) {
              yield item;
            }
          }
        })
      });

      (fs.writeFile as any).mockResolvedValue(undefined);

      // Mock checkpoint data updates to simulate real database operations
      (updateCheckpointData as any).mockImplementation(
        async (taskId: string, stage: string, data: any, merge: boolean = false) => {
          if (merge) {
            checkpointData[stage] = { ...checkpointData[stage], ...data };
          } else {
            checkpointData[stage] = data;
          }
          return Promise.resolve();
        }
      );

      // Mock SFT operations
      const { createSFTTask, querySFTTaskStatus } = await import(
        '@fastgpt/service/core/train/rerank/external'
      );
      (createSFTTask as any).mockResolvedValue({
        task_id: 'sft_task_123'
      });
      (querySFTTaskStatus as any).mockResolvedValue({
        task_id: 'sft_task_123',
        status: 'completed',
        endpoint: {
          base_url: 'http://sft-bridge.com/v1',
          model: 'tuned-model',
          api_key: 'sft-bridge-key'
        }
      });

      // Mock application and version operations
      const { MongoApp } = await import('@fastgpt/service/core/app/schema');
      const { MongoAppVersion } = await import('@fastgpt/service/core/app/version/schema');

      // Mock app with datasetSearchNode and chatNode (for AI model extraction)
      const mockApp = {
        _id: mockAppId,
        modules: [
          {
            flowNodeType: 'chatNode',
            inputs: [
              {
                key: 'model',
                value: 'gpt-4'
              }
            ]
          },
          {
            flowNodeType: 'datasetSearchNode',
            inputs: [
              {
                key: 'rerankModel',
                value: 'base_model_123'
              },
              {
                key: 'datasets',
                value: [{ datasetId: 'dataset_001' }, { datasetId: 'dataset_002' }]
              }
            ]
          }
        ],
        edges: [],
        chatConfig: {},
        pluginData: {
          nodeVersion: null
        }
      };

      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockApp)
      });
      (MongoApp.findByIdAndUpdate as any).mockResolvedValue(undefined);
      (MongoAppVersion.create as any).mockResolvedValue([
        {
          _id: 'version_123'
        }
      ]);

      // Mock task deletion with file path
      (deleteRerankTrainTask as any).mockImplementation(async (taskId: string) => {
        const task = await getRerankTrainTask(taskId);
        if (task?.result?.trainDatasetFilePath) {
          // 使用 fs.promises 的 mock 版本
          const fsPromises = await import('fs/promises');
          await fsPromises.unlink(task.result.trainDatasetFilePath);
        }
      });

      // Mock file exists and can be deleted
      (fs.unlink as any).mockResolvedValue(undefined);

      // Mock remaining stages
      const { syntheticRerankEvalData, evaluateRerank } = await import(
        '@fastgpt/service/core/train/rerank/external'
      );
      const { createRerankModelConfig } = await import(
        '@fastgpt/service/core/train/rerank/model/controller'
      );
      (createRerankModelConfig as any).mockResolvedValue('config_123');

      // Mock evaluation dataset collections
      const { MongoEvalDatasetCollection } = await import(
        '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema'
      );
      const { MongoEvalDatasetData } = await import(
        '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema'
      );
      (MongoEvalDatasetCollection.create as any).mockResolvedValue([
        {
          _id: 'eval_dataset_123',
          teamId: mockTeamId,
          tmbId: mockTmbId,
          name: 'Test Eval Collection'
        }
      ]);
      (MongoEvalDatasetData.insertMany as any).mockResolvedValue([
        {
          _id: 'eval_data_123',
          collectionId: 'eval_dataset_123'
        }
      ]);

      // Mock MongoEvalDatasetData.find 用于评测阶段
      if (!(MongoEvalDatasetData.find as any).mock) {
        (MongoEvalDatasetData.find as any).mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            {
              userInput: 'Test eval question',
              retrievalContextsFull: [
                {
                  id: 'data_001',
                  q: 'Test question 1',
                  a: 'Test answer 1',
                  score: [{ type: 'fullText', value: 1.5, index: 0 }]
                }
              ],
              expectedContextIds: ['data_001']
            }
          ])
        });
      }

      // Mock getRerankModel
      const { getRerankModel } = await import('@fastgpt/service/core/ai/model');
      if (!(getRerankModel as any).mock) {
        (getRerankModel as any).mockReturnValue({
          model: 'test-rerank-model',
          requestUrl: 'http://test.com',
          requestAuth: 'test-api-key'
        });
      }

      (syntheticRerankEvalData as any).mockResolvedValue({
        success: true,
        data: {
          qaPair: {
            question: 'Test eval question',
            answer: 'Test eval answer'
          }
        }
      });
      (evaluateRerank as any).mockResolvedValue({
        success: true,
        data: {
          runLogs: {
            detailed_results: {
              rerank_top10_ndcg: 0.85,
              rerank_top10_mrr: 0.9,
              rerank_top10_precision: 0.82,
              rerank_top10_recall: 0.78
            }
          }
        }
      });

      // Note: getRerankTrainTask is already mocked above with data evolution pattern

      await rerankTrainTaskProcessor({
        data: {
          taskId: mockTaskId,
          isRetry: false
        },
        attemptsMade: 0,
        opts: {
          attempts: 3
        }
      } as any);

      // 验证文件写入和清理
      expect(fs.createWriteStream).toHaveBeenCalled();
      // Note: fs.unlink would be called when the task is deleted, not during normal execution

      // 验证最终结果保存
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );
      expect(MongoRerankTrainTask.updateOne).toHaveBeenCalledWith(
        { _id: mockTaskId },
        {
          result: {
            trainDatasetId: expect.any(String),
            trainDatasetFilePath: expect.any(String),
            tunedModelConfigId: 'tuned-model',
            evalDatasetId: 'eval_dataset_123',
            baseModelEvalResult: {
              detailed_results: {
                rerank_top10_ndcg: 0.85,
                rerank_top10_mrr: 0.9,
                rerank_top10_precision: 0.82,
                rerank_top10_recall: 0.78
              }
            },
            tunedModelEvalResult: {
              detailed_results: {
                rerank_top10_ndcg: 0.85,
                rerank_top10_mrr: 0.9,
                rerank_top10_precision: 0.82,
                rerank_top10_recall: 0.78
              }
            },
            // 应用更新结果
            versionId: 'version_123',
            versionName: expect.any(String),
            previousModelConfigId: 'base_model_123',
            previousTaskId: '',
            updatedNodesCount: 1
          }
        }
      );
    });
  });

  describe('任务失败处理', () => {
    test('UnrecoverableError 应该被抛出（状态更新由 worker 的 failed 事件处理）', async () => {
      const { getRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/controller'
      );
      const { MongoRerankTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/data/schema'
      );

      const mockTask = createMockTask();
      (getRerankTrainTask as any).mockResolvedValue(mockTask);

      //Mock 空的训练数据，这会触发 UnrecoverableError
      (MongoRerankTrainsetData.find as any).mockReturnValue({
        cursor: vi.fn().mockReturnValue({
          async *[Symbol.asyncIterator]() {
            // 空迭代器
          }
        })
      });

      await expect(
        rerankTrainTaskProcessor({
          data: {
            taskId: mockTaskId,
            isRetry: false
          },
          attemptsMade: 0,
          opts: {
            attempts: 3
          }
        } as any)
      ).rejects.toThrow('Training data is empty');

      // 注意：processor 不再直接更新 MongoDB 状态
      // 状态更新由 worker 的 failed 事件处理器统一处理
    });

    test('SFT 任务失败应该抛出错误', async () => {
      const { updateCheckpointData, updateCheckpointStage, getRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/controller'
      );
      const { MongoRerankTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/data/schema'
      );
      const { createSFTTask, querySFTTaskStatus } = await import(
        '@fastgpt/service/core/train/rerank/external'
      );

      const mockTask = createMockTask();
      const checkpointData: any = {};

      (getRerankTrainTask as any).mockImplementation(async (id: string) => {
        if (id === mockTaskId) {
          return Promise.resolve({
            ...mockTask,
            checkpoint: {
              ...mockTask.checkpoint,
              data: { ...checkpointData }
            }
          });
        }
        return Promise.resolve(null);
      });

      const mockTrainData = [
        {
          _id: 'data_1',
          trainsetId: 'trainset_1',
          query: 'test',
          positiveDocs: ['positive'],
          negativeDocs: ['negative']
        }
      ];
      (MongoRerankTrainsetData.find as any).mockReturnValue({
        cursor: vi.fn().mockReturnValue({
          async *[Symbol.asyncIterator]() {
            for (const item of mockTrainData) {
              yield item;
            }
          }
        })
      });

      (fs.writeFile as any).mockResolvedValue(undefined);
      (fs.readFile as any).mockResolvedValue(Buffer.from('test data'));

      // Mock checkpoint data updates
      (updateCheckpointData as any).mockImplementation(
        async (taskId: string, stage: string, data: any, merge: boolean = false) => {
          if (merge) {
            checkpointData[stage] = { ...checkpointData[stage], ...data };
          } else {
            checkpointData[stage] = data;
          }
          return Promise.resolve();
        }
      );

      // Mock SFT 创建成功但查询返回失败状态
      (createSFTTask as any).mockResolvedValue({
        task_id: 'sft_task_123'
      });
      (querySFTTaskStatus as any).mockResolvedValue({
        task_id: 'sft_task_123',
        status: 'failed',
        error: 'Training failed due to insufficient data'
      });

      await expect(
        rerankTrainTaskProcessor({
          data: {
            taskId: mockTaskId,
            isRetry: false
          },
          attemptsMade: 0,
          opts: {
            attempts: 3
          }
        } as any)
      ).rejects.toThrow('SFT Bridge training task failed');

      // 验证阶段已更新到 preparing
      expect(updateCheckpointStage).toHaveBeenCalledWith(
        mockTaskId,
        RerankTaskCheckpointStageEnum.preparing
      );
    });

    test('评测阶段失败应该抛出错误', async () => {
      const { updateCheckpointData, updateCheckpointStage, getRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/controller'
      );
      const { MongoRerankTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/data/schema'
      );
      const { createSFTTask, querySFTTaskStatus, syntheticRerankEvalData } = await import(
        '@fastgpt/service/core/train/rerank/external'
      );
      const { createRerankModelConfig } = await import(
        '@fastgpt/service/core/train/rerank/model/controller'
      );

      const mockTask = createMockTask();
      const checkpointData: any = {};

      (getRerankTrainTask as any).mockImplementation(async (id: string) => {
        if (id === mockTaskId) {
          return Promise.resolve({
            ...mockTask,
            checkpoint: {
              ...mockTask.checkpoint,
              data: { ...checkpointData }
            }
          });
        }
        return Promise.resolve(null);
      });

      const mockTrainData = [
        {
          _id: 'data_1',
          trainsetId: 'trainset_1',
          query: 'test',
          positiveDocs: ['positive'],
          negativeDocs: ['negative']
        }
      ];
      (MongoRerankTrainsetData.find as any).mockReturnValue({
        cursor: vi.fn().mockReturnValue({
          async *[Symbol.asyncIterator]() {
            for (const item of mockTrainData) {
              yield item;
            }
          }
        })
      });

      (fs.writeFile as any).mockResolvedValue(undefined);
      (fs.readFile as any).mockResolvedValue(Buffer.from('test data'));

      // Mock checkpoint data updates
      (updateCheckpointData as any).mockImplementation(
        async (taskId: string, stage: string, data: any, merge: boolean = false) => {
          if (merge) {
            checkpointData[stage] = { ...checkpointData[stage], ...data };
          } else {
            checkpointData[stage] = data;
          }
          return Promise.resolve();
        }
      );

      // Mock SFT 成功
      (createSFTTask as any).mockResolvedValue({
        task_id: 'sft_task_123'
      });
      (querySFTTaskStatus as any).mockResolvedValue({
        task_id: 'sft_task_123',
        status: 'completed',
        endpoint: {
          base_url: 'http://sft-bridge.com/v1',
          model: 'tuned-model',
          api_key: 'sft-bridge-key'
        }
      });

      // Mock 模型注册成功
      (createRerankModelConfig as any).mockResolvedValue('config_123');

      // Mock application for dataset extraction
      const { MongoApp } = await import('@fastgpt/service/core/app/schema');
      const mockApp = {
        _id: mockAppId,
        modules: [
          {
            flowNodeType: 'chatNode',
            inputs: [
              {
                key: 'model',
                value: 'gpt-4'
              }
            ]
          },
          {
            flowNodeType: 'datasetSearchNode',
            inputs: [
              {
                key: 'rerankModel',
                value: 'base_model_123'
              },
              {
                key: 'datasets',
                value: [{ datasetId: 'dataset_001' }, { datasetId: 'dataset_002' }]
              }
            ]
          }
        ],
        edges: [],
        chatConfig: {},
        pluginData: {
          nodeVersion: null
        }
      };
      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockApp)
      });

      // Mock 评测数据集生成失败
      (syntheticRerankEvalData as any).mockResolvedValue({
        success: false,
        error: 'Failed to connect to evaluation service'
      });

      await expect(
        rerankTrainTaskProcessor({
          data: {
            taskId: mockTaskId,
            isRetry: false
          },
          attemptsMade: 0,
          opts: {
            attempts: 3
          }
        } as any)
      ).rejects.toThrow('DiTing service failed to generate any evaluation QA pairs');

      // 验证阶段已更新到 registering
      expect(updateCheckpointStage).toHaveBeenCalledWith(
        mockTaskId,
        RerankTaskCheckpointStageEnum.registering
      );
    });

    test('任务不存在时应该抛出 UnrecoverableError', async () => {
      const { getRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/controller'
      );

      // Mock 任务不存在
      (getRerankTrainTask as any).mockResolvedValue(null);

      await expect(
        rerankTrainTaskProcessor({
          data: {
            taskId: 'non_existent_task',
            isRetry: false
          },
          attemptsMade: 0,
          opts: {
            attempts: 3
          }
        } as any)
      ).rejects.toThrow('Training task not found');
    });

    test('应用更新阶段未找到可更新节点应该抛出 UnrecoverableError', async () => {
      const { updateCheckpointData, updateCheckpointStage, getRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/controller'
      );
      const { MongoRerankTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/data/schema'
      );
      const { createSFTTask, querySFTTaskStatus, syntheticRerankEvalData, evaluateRerank } =
        await import('@fastgpt/service/core/train/rerank/external');
      const { createRerankModelConfig } = await import(
        '@fastgpt/service/core/train/rerank/model/controller'
      );
      const { MongoApp } = await import('@fastgpt/service/core/app/schema');
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );

      const mockTask = createMockTask();
      const checkpointData: any = {};

      (getRerankTrainTask as any).mockImplementation(async (id: string) => {
        if (id === mockTaskId) {
          return Promise.resolve({
            ...mockTask,
            checkpoint: {
              ...mockTask.checkpoint,
              data: { ...checkpointData }
            }
          });
        }
        return Promise.resolve(null);
      });

      const mockTrainData = [
        {
          _id: 'data_1',
          trainsetId: 'trainset_1',
          query: 'test',
          positiveDocs: ['positive'],
          negativeDocs: ['negative']
        }
      ];
      (MongoRerankTrainsetData.find as any).mockReturnValue({
        cursor: vi.fn().mockReturnValue({
          async *[Symbol.asyncIterator]() {
            for (const item of mockTrainData) {
              yield item;
            }
          }
        })
      });

      (fs.writeFile as any).mockResolvedValue(undefined);
      (fs.readFile as any).mockResolvedValue(Buffer.from('test data'));

      // Mock checkpoint data updates
      (updateCheckpointData as any).mockImplementation(
        async (taskId: string, stage: string, data: any, merge: boolean = false) => {
          if (merge) {
            checkpointData[stage] = { ...checkpointData[stage], ...data };
          } else {
            checkpointData[stage] = data;
          }
          return Promise.resolve();
        }
      );

      // Mock SFT 成功
      (createSFTTask as any).mockResolvedValue({
        task_id: 'sft_task_123'
      });
      (querySFTTaskStatus as any).mockResolvedValue({
        task_id: 'sft_task_123',
        status: 'completed',
        endpoint: {
          base_url: 'http://sft-bridge.com/v1',
          model: 'tuned-model',
          api_key: 'sft-bridge-key'
        }
      });

      // Mock 模型注册成功
      (createRerankModelConfig as any).mockResolvedValue('config_123');

      // Mock evaluation dataset collections
      const { MongoEvalDatasetCollection } = await import(
        '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema'
      );
      const { MongoEvalDatasetData } = await import(
        '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema'
      );
      (MongoEvalDatasetCollection.create as any).mockResolvedValue([
        {
          _id: 'eval_dataset_123',
          teamId: mockTeamId,
          tmbId: mockTmbId,
          name: 'Test Eval Collection'
        }
      ]);
      (MongoEvalDatasetData.insertMany as any).mockResolvedValue([
        {
          _id: 'eval_data_123',
          collectionId: 'eval_dataset_123'
        }
      ]);

      // Mock 评测成功
      (syntheticRerankEvalData as any).mockResolvedValue({
        success: true,
        data: {
          qaPair: {
            question: 'Test eval question',
            answer: 'Test eval answer'
          }
        }
      });
      (evaluateRerank as any).mockResolvedValue({
        success: true,
        data: {
          runLogs: {
            detailed_results: {
              rerank_top10_ndcg: 0.85,
              rerank_top10_mrr: 0.9,
              rerank_top10_precision: 0.82,
              rerank_top10_recall: 0.78
            }
          }
        }
      });

      // Mock 应用配置有 datasets 和 chatNode 但没有 rerankModel
      const mockAppWithoutRerank = {
        _id: mockAppId,
        modules: [
          {
            flowNodeType: 'chatNode',
            inputs: [
              {
                key: 'model',
                value: 'gpt-4'
              }
            ]
          },
          {
            flowNodeType: 'datasetSearchNode',
            inputs: [
              {
                key: 'datasets',
                value: [{ datasetId: 'dataset_001' }, { datasetId: 'dataset_002' }]
              }
              // 故意不添加 rerankModel，以触发"未找到可更新节点"的错误
            ]
          }
        ],
        edges: [],
        chatConfig: {},
        pluginData: {
          nodeVersion: null
        }
      };

      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockAppWithoutRerank)
      });

      await expect(
        rerankTrainTaskProcessor({
          data: {
            taskId: mockTaskId,
            isRetry: false
          },
          attemptsMade: 0,
          opts: {
            attempts: 3
          }
        } as any)
      ).rejects.toThrow('No Rerank model nodes found');

      // 注意：processor 不再直接更新 MongoDB 状态
      // 状态更新由 worker 的 failed 事件处理器统一处理
    });
  });

  describe('performDatasetSearch', () => {
    test('应该成功执行知识库检索', async () => {
      const { performDatasetSearch } = await import(
        '@fastgpt/service/core/train/rerank/task/helpers/dataset-search'
      );
      const { MongoApp } = await import('@fastgpt/service/core/app/schema');
      const { dispatchDatasetSearch } = await import(
        '@fastgpt/service/core/workflow/dispatch/dataset/search'
      );

      // 创建模拟任务
      const mockTask = createMockTask() as RerankTrainTaskSchemaType;

      // 创建模拟应用配置
      const mockApp = {
        _id: mockAppId,
        modules: [
          {
            flowNodeType: 'datasetSearchNode',
            inputs: [
              {
                key: 'datasets',
                value: [{ datasetId: 'dataset_001' }, { datasetId: 'dataset_002' }]
              }
            ]
          }
        ]
      };

      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockApp)
      });

      // 模拟 dispatchDatasetSearch 返回值
      (dispatchDatasetSearch as any).mockResolvedValue({
        data: {
          quoteQA: [
            {
              id: 'context_001',
              q: 'Test question 1',
              a: 'Test answer 1',
              score: [{ type: 'embedding', value: 0.95, index: 0 }]
            },
            {
              id: 'context_002',
              q: 'Test question 2',
              a: 'Test answer 2',
              score: [{ type: 'rerank', value: 0.88, index: 1 }]
            }
          ]
        }
      });

      // 执行检索
      const results = await performDatasetSearch(mockTask, mockApp as AppSchema, 'Test query');

      // 验证结果
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        id: 'context_001',
        q: 'Test question 1',
        a: 'Test answer 1',
        score: [{ type: 'embedding', value: 0.95, index: 0 }]
      });
      expect(results[1]).toEqual({
        id: 'context_002',
        q: 'Test question 2',
        a: 'Test answer 2',
        score: [{ type: 'rerank', value: 0.88, index: 1 }]
      });

      // 验证 dispatchDatasetSearch 被正确调用（不使用 rerank）
      expect(dispatchDatasetSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'test',
          params: expect.objectContaining({
            userChatInput: 'Test query',
            rerankModel: undefined,
            usingReRank: false,
            // 验证使用了应用的实际搜索参数
            similarity: 0.4,
            limit: 5000,
            searchMode: 'embedding'
          })
        })
      );
    });

    test('应该正确处理空的检索结果', async () => {
      const { performDatasetSearch } = await import(
        '@fastgpt/service/core/train/rerank/task/helpers/dataset-search'
      );
      const { MongoApp } = await import('@fastgpt/service/core/app/schema');
      const { dispatchDatasetSearch } = await import(
        '@fastgpt/service/core/workflow/dispatch/dataset/search'
      );

      const mockTask = createMockTask() as RerankTrainTaskSchemaType;
      const mockApp = {
        _id: mockAppId,
        modules: [
          {
            flowNodeType: 'datasetSearchNode',
            inputs: [
              {
                key: 'datasets',
                value: [{ datasetId: 'dataset_001' }]
              }
            ]
          }
        ]
      };

      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockApp)
      });

      // 模拟空的检索结果
      (dispatchDatasetSearch as any).mockResolvedValue({
        data: {
          quoteQA: []
        }
      });

      const results = await performDatasetSearch(
        mockTask,
        mockApp as AppSchema,
        'No results query'
      );

      expect(results).toHaveLength(0);
    });
  });

  describe('runGenerateEvalDataset', () => {
    test('应该成功生成评测数据集', async () => {
      const { runGenerateEvalDataset } = await import(
        '@fastgpt/service/core/train/rerank/task/stages/evaluate'
      );
      const { MongoApp } = await import('@fastgpt/service/core/app/schema');
      const { sampleDataFromDataset } = await import('@fastgpt/service/core/train/rerank/utils');
      const { syntheticRerankEvalData } = await import(
        '@fastgpt/service/core/train/rerank/external'
      );
      const { dispatchDatasetSearch } = await import(
        '@fastgpt/service/core/workflow/dispatch/dataset/search'
      );
      const { MongoEvalDatasetCollection } = await import(
        '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema'
      );
      const { MongoEvalDatasetData } = await import(
        '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema'
      );

      // 创建模拟任务
      const mockTask = createMockTask() as RerankTrainTaskSchemaType;

      // 创建模拟应用配置（包含 AI 模型配置）
      const mockApp = {
        _id: mockAppId,
        modules: [
          {
            flowNodeType: 'datasetSearchNode',
            inputs: [
              {
                key: 'datasets',
                value: [{ datasetId: 'dataset_001' }]
              }
            ]
          },
          {
            flowNodeType: 'chatNode',
            inputs: [
              {
                key: 'model',
                value: 'gpt-4'
              }
            ]
          }
        ]
      };

      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockApp)
      });

      // 模拟采样数据
      (sampleDataFromDataset as any).mockResolvedValue([
        {
          datasetId: 'dataset_001',
          dataId: 'data_001',
          q: 'Sample question 1',
          a: 'Sample answer 1'
        }
      ]);

      // 模拟 DiTing 生成评测 QA 对
      (syntheticRerankEvalData as any).mockResolvedValue({
        success: true,
        data: {
          qaPair: {
            question: 'Generated question 1',
            answer: 'Generated answer 1'
          }
        }
      });

      // 模拟检索结果
      (dispatchDatasetSearch as any).mockResolvedValue({
        data: {
          quoteQA: [
            {
              id: 'data_001',
              q: 'Sample question 1',
              a: 'Sample answer 1',
              score: [{ type: 'embedding', value: 0.9, index: 0 }]
            }
          ]
        }
      });

      // 模拟评测数据集创建
      (MongoEvalDatasetCollection.create as any).mockResolvedValue([
        {
          _id: 'eval_collection_123',
          teamId: mockTeamId,
          tmbId: mockTmbId,
          name: 'Base Model Eval - Task test'
        }
      ]);

      (MongoEvalDatasetData.insertMany as any).mockResolvedValue([
        {
          _id: 'eval_data_123'
        }
      ]);

      // 执行生成评测数据集
      const evalDatasetId = await runGenerateEvalDataset(mockTask);

      // 验证结果
      expect(evalDatasetId).toBe('eval_collection_123');

      // 验证 DiTing API 被调用，并使用了从应用提取的模型配置
      expect(syntheticRerankEvalData).toHaveBeenCalledWith(
        expect.objectContaining({
          llm_config: expect.objectContaining({
            name: 'gpt-4' // 应该使用从应用工作流中提取的模型
          })
        })
      );

      // 验证数据集创建（统一的评测数据集）
      expect(MongoEvalDatasetCollection.create).toHaveBeenCalledWith([
        expect.objectContaining({
          name: 'Eval Dataset - Task task_123',
          description: expect.stringContaining('Rerank Model Evaluation Dataset'),
          metadata: expect.objectContaining({
            taskId: 'task_123',
            taskName: 'Test Rerank Task',
            sampleSize: 1
          })
        })
      ]);

      // 验证数据插入
      expect(MongoEvalDatasetData.insertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            userInput: 'Generated question 1',
            expectedOutput: 'Generated answer 1',
            retrievalContextsFull: expect.any(Array),
            expectedContextIds: ['data_001']
          })
        ])
      );
    });

    test('应该在没有 AI 模型配置时使用系统默认模型', async () => {
      const { runGenerateEvalDataset } = await import(
        '@fastgpt/service/core/train/rerank/task/stages/evaluate'
      );
      const { MongoApp } = await import('@fastgpt/service/core/app/schema');
      const { sampleDataFromDataset } = await import('@fastgpt/service/core/train/rerank/utils');
      const { syntheticRerankEvalData } = await import(
        '@fastgpt/service/core/train/rerank/external'
      );
      const { dispatchDatasetSearch } = await import(
        '@fastgpt/service/core/workflow/dispatch/dataset/search'
      );
      const { MongoEvalDatasetCollection } = await import(
        '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema'
      );
      const { MongoEvalDatasetData } = await import(
        '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema'
      );
      const { getDefaultLLMModel } = await import('@fastgpt/service/core/ai/model');

      const mockTask = createMockTask() as RerankTrainTaskSchemaType;

      // 创建没有 AI 模型配置的应用（没有 chatNode）
      const mockApp = {
        _id: mockAppId,
        modules: [
          {
            flowNodeType: 'datasetSearchNode',
            inputs: [
              {
                key: 'datasets',
                value: [{ datasetId: 'dataset_001' }]
              }
            ]
          }
        ]
      };

      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockApp)
      });

      // Mock 系统默认模型
      (getDefaultLLMModel as any).mockReturnValue({
        model: 'default-llm-model',
        name: 'Default LLM Model'
      });

      // 模拟采样数据
      (sampleDataFromDataset as any).mockResolvedValue([
        {
          datasetId: 'dataset_001',
          dataId: 'data_001',
          q: 'Sample question 1',
          a: 'Sample answer 1'
        }
      ]);

      // 模拟 DiTing 生成评测 QA 对
      (syntheticRerankEvalData as any).mockResolvedValue({
        success: true,
        data: {
          qaPair: {
            question: 'Generated question 1',
            answer: 'Generated answer 1'
          }
        }
      });

      // 模拟检索结果
      (dispatchDatasetSearch as any).mockResolvedValue({
        data: {
          quoteQA: [
            {
              id: 'data_001',
              q: 'Sample question 1',
              a: 'Sample answer 1',
              score: [{ type: 'embedding', value: 0.9, index: 0 }]
            }
          ]
        }
      });

      // 模拟评测数据集创建
      (MongoEvalDatasetCollection.create as any).mockResolvedValue([
        {
          _id: 'eval_collection_123',
          teamId: mockTeamId,
          tmbId: mockTmbId,
          name: 'Base Model Eval - Task test'
        }
      ]);

      (MongoEvalDatasetData.insertMany as any).mockResolvedValue([
        {
          _id: 'eval_data_123'
        }
      ]);

      // 应该成功执行，使用系统默认模型
      const evalDatasetId = await runGenerateEvalDataset(mockTask);

      // 验证结果
      expect(evalDatasetId).toBe('eval_collection_123');

      // 验证使用了系统默认模型
      expect(syntheticRerankEvalData).toHaveBeenCalledWith(
        expect.objectContaining({
          llm_config: expect.objectContaining({
            name: 'default-llm-model' // 应该使用系统默认模型
          })
        })
      );
    });

    test('应该在没有数据可用时抛出错误', async () => {
      const { runGenerateEvalDataset } = await import(
        '@fastgpt/service/core/train/rerank/task/stages/evaluate'
      );
      const { MongoApp } = await import('@fastgpt/service/core/app/schema');
      const { sampleDataFromDataset } = await import('@fastgpt/service/core/train/rerank/utils');

      const mockTask = createMockTask() as RerankTrainTaskSchemaType;
      const mockApp = {
        _id: mockAppId,
        modules: [
          {
            flowNodeType: 'datasetSearchNode',
            inputs: [
              {
                key: 'datasets',
                value: [{ datasetId: 'dataset_001' }]
              }
            ]
          }
        ]
      };

      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockApp)
      });

      // 模拟没有采样数据
      (sampleDataFromDataset as any).mockResolvedValue([]);

      await expect(runGenerateEvalDataset(mockTask)).rejects.toThrow(
        'No evaluation data available'
      );
    });
  });

  describe('自动删除之前的微调模型', () => {
    test('新模型表现更好时，应该自动删除之前的微调模型', async () => {
      const { updateTaskStatus, updateCheckpointStage, updateCheckpointData, getRerankTrainTask } =
        await import('@fastgpt/service/core/train/rerank/task/controller');
      const { MongoRerankTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/data/schema'
      );
      const { createRerankModelConfig, deleteRerankModelConfig } = await import(
        '@fastgpt/service/core/train/rerank/model/controller'
      );
      const { createSFTTask, querySFTTaskStatus, syntheticRerankEvalData, evaluateRerank } =
        await import('@fastgpt/service/core/train/rerank/external');
      const { getRerankModel } = await import('@fastgpt/service/core/ai/model');

      // Mock MongoRerankTrainTask.findOne for previous task lookup
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );
      (MongoRerankTrainTask.findOne as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null) // No previous task found
      });
      (MongoRerankTrainTask.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null) // No previous task found by id
      });

      // Mock initial task
      const mockTask = createMockTask();
      (getRerankTrainTask as any).mockResolvedValue(mockTask);

      // Mock train data
      const mockTrainData = [
        {
          _id: 'data_1',
          trainsetId: 'trainset_1',
          query: 'query 1',
          positiveDocs: ['doc 1'],
          negativeDocs: ['doc 2']
        }
      ];
      (MongoRerankTrainsetData.find as any).mockReturnValue({
        cursor: vi.fn().mockReturnValue({
          async *[Symbol.asyncIterator]() {
            for (const item of mockTrainData) {
              yield item;
            }
          }
        })
      });

      // Mock SFT operations
      (createSFTTask as any).mockResolvedValue({
        task_id: 'sft_task_123'
      });
      (querySFTTaskStatus as any).mockResolvedValue({
        task_id: 'sft_task_123',
        status: 'completed',
        endpoint: {
          base_url: 'http://sft-bridge.com/v1',
          model: 'tuned-model-new',
          api_key: 'sft-bridge-key'
        }
      });

      // Mock model creation
      (createRerankModelConfig as any).mockResolvedValue('new_model_config_123');

      // Mock application
      const { MongoApp } = await import('@fastgpt/service/core/app/schema');
      const { MongoAppVersion } = await import('@fastgpt/service/core/app/version/schema');

      const mockApp = {
        _id: mockAppId,
        modules: [
          {
            flowNodeType: 'chatNode',
            inputs: [{ key: 'model', value: 'gpt-4' }]
          },
          {
            flowNodeType: 'datasetSearchNode',
            inputs: [
              {
                key: 'rerankModel',
                value: 'base_model_123' // 使用 baseModel，这样才能被更新
              },
              {
                key: 'datasets',
                value: [{ datasetId: 'dataset_001' }]
              }
            ]
          }
        ],
        edges: [],
        chatConfig: {},
        pluginData: { nodeVersion: null }
      };

      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockApp)
      });
      (MongoApp.findByIdAndUpdate as any).mockResolvedValue(undefined);
      (MongoAppVersion.create as any).mockResolvedValue([{ _id: 'version_123' }]);

      // Mock evaluation datasets
      const { MongoEvalDatasetCollection } = await import(
        '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema'
      );
      const { MongoEvalDatasetData } = await import(
        '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema'
      );
      (MongoEvalDatasetCollection.create as any).mockResolvedValue([
        { _id: 'eval_dataset_123', teamId: mockTeamId, tmbId: mockTmbId }
      ]);
      (MongoEvalDatasetData.insertMany as any).mockResolvedValue([
        { _id: 'eval_data_123', collectionId: 'eval_dataset_123' }
      ]);
      (MongoEvalDatasetData.find as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            userInput: 'Test question',
            retrievalContextsFull: [
              {
                id: 'data_001',
                q: 'Test question',
                a: 'Test answer',
                score: [{ type: 'fullText', value: 1.5, index: 0 }]
              }
            ],
            expectedContextIds: ['data_001']
          }
        ])
      });

      // Mock getRerankModel - 之前的模型现在通过 previousModelConfigId 获取
      // previousModelConfigId 会在 apply 阶段被记录
      (getRerankModel as any).mockImplementation((modelId: string) => {
        if (modelId === 'base_model_123') {
          // 这是上一次微调后保存的模型（现在被记录为 base_model_123）
          return {
            model: 'base_model_123',
            isTuned: true, // 实际是之前的微调模型
            requestUrl: 'http://old.com',
            requestAuth: 'old-key'
          };
        }
        return {
          model: modelId,
          requestUrl: 'http://test.com',
          requestAuth: 'test-key'
        };
      });

      // Mock evaluation - 新模型表现更好
      (syntheticRerankEvalData as any).mockResolvedValue({
        success: true,
        data: {
          qaPair: {
            question: 'Test eval question',
            answer: 'Test eval answer'
          }
        }
      });

      // 第一次评测（之前的微调模型）：overall_ndcg = 0.75
      // 第二次评测（新微调模型）：overall_ndcg = 0.85
      let evalCallCount = 0;
      (evaluateRerank as any).mockImplementation(async () => {
        evalCallCount++;
        if (evalCallCount === 1) {
          // Base model (previous tuned model) evaluation
          return {
            success: true,
            data: {
              runLogs: {
                detailed_results: {
                  overall_ndcg: 0.75,
                  overall_mrr: 0.8,
                  overall_precision: 0.7, // Added precision
                  overall_map: 0.72
                }
              }
            }
          };
        } else {
          // New tuned model evaluation (better performance)
          return {
            success: true,
            data: {
              runLogs: {
                detailed_results: {
                  overall_ndcg: 0.85,
                  overall_mrr: 0.9,
                  overall_precision: 0.82, // Added precision (better than base)
                  overall_map: 0.82
                }
              }
            }
          };
        }
      });

      // Mock dataset search
      const { dispatchDatasetSearch } = await import(
        '@fastgpt/service/core/workflow/dispatch/dataset/search'
      );
      (dispatchDatasetSearch as any).mockResolvedValue({
        data: {
          quoteQA: [
            {
              id: 'data_001',
              q: 'Test question',
              a: 'Test answer',
              score: [{ type: 'embedding', value: 0.95, index: 0 }]
            }
          ]
        }
      });

      // Mock checkpoint data
      let taskState = { ...mockTask };
      const checkpointData: any = {};

      (getRerankTrainTask as any).mockImplementation(async (id: string) => {
        if (id === mockTaskId) {
          return Promise.resolve({
            ...taskState,
            checkpoint: {
              ...taskState.checkpoint,
              data: { ...checkpointData }
            }
          });
        }
        return Promise.resolve(null);
      });

      (updateCheckpointData as any).mockImplementation(
        async (taskId: string, stage: string, data: any, merge: boolean = false) => {
          if (merge) {
            checkpointData[stage] = { ...checkpointData[stage], ...data };
          } else {
            checkpointData[stage] = data;
          }
          return Promise.resolve();
        }
      );

      // Mock deleteRerankModelConfig to track deletion calls
      (deleteRerankModelConfig as any).mockResolvedValue(undefined);

      await rerankTrainTaskProcessor({
        data: {
          taskId: mockTaskId,
          isRetry: false
        },
        attemptsMade: 0,
        opts: {
          attempts: 3
        }
      } as any);

      // 验证删除函数被调用（删除之前的微调模型）
      // previousTaskId为空，因为没有找到previous task，所以sftTaskId为undefined
      expect(deleteRerankModelConfig).toHaveBeenCalledWith('base_model_123', undefined);

      // 验证任务最终状态
      expect(updateTaskStatus).toHaveBeenCalledWith(
        mockTaskId,
        RerankTrainTaskStatusEnum.completed
      );
    });

    test('新模型表现不如之前模型时，应该保留之前的微调模型', async () => {
      const { updateTaskStatus, updateCheckpointData, getRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/controller'
      );
      const { MongoRerankTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/data/schema'
      );
      const { createRerankModelConfig, deleteRerankModelConfig } = await import(
        '@fastgpt/service/core/train/rerank/model/controller'
      );
      const { createSFTTask, querySFTTaskStatus, syntheticRerankEvalData, evaluateRerank } =
        await import('@fastgpt/service/core/train/rerank/external');
      const { getRerankModel } = await import('@fastgpt/service/core/ai/model');

      // Mock MongoRerankTrainTask.findOne for previous task lookup
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );
      (MongoRerankTrainTask.findOne as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null) // No previous task found
      });
      (MongoRerankTrainTask.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null) // No previous task found by id
      });

      const mockTask = createMockTask();
      (getRerankTrainTask as any).mockResolvedValue(mockTask);

      const mockTrainData = [
        {
          _id: 'data_1',
          trainsetId: 'trainset_1',
          query: 'query 1',
          positiveDocs: ['doc 1'],
          negativeDocs: ['doc 2']
        }
      ];
      (MongoRerankTrainsetData.find as any).mockReturnValue({
        cursor: vi.fn().mockReturnValue({
          async *[Symbol.asyncIterator]() {
            for (const item of mockTrainData) {
              yield item;
            }
          }
        })
      });

      (createSFTTask as any).mockResolvedValue({ task_id: 'sft_task_123' });
      (querySFTTaskStatus as any).mockResolvedValue({
        task_id: 'sft_task_123',
        status: 'completed',
        endpoint: {
          base_url: 'http://sft-bridge.com/v1',
          model: 'tuned-model-new',
          api_key: 'sft-bridge-key'
        }
      });

      (createRerankModelConfig as any).mockResolvedValue('new_model_config_123');

      const { MongoApp } = await import('@fastgpt/service/core/app/schema');
      const { MongoAppVersion } = await import('@fastgpt/service/core/app/version/schema');

      const mockApp = {
        _id: mockAppId,
        modules: [
          {
            flowNodeType: 'chatNode',
            inputs: [{ key: 'model', value: 'gpt-4' }]
          },
          {
            flowNodeType: 'datasetSearchNode',
            inputs: [
              {
                key: 'rerankModel',
                value: 'base_model_123' // 使用 baseModel，这样才能被更新
              },
              {
                key: 'datasets',
                value: [{ datasetId: 'dataset_001' }]
              }
            ]
          }
        ],
        edges: [],
        chatConfig: {},
        pluginData: { nodeVersion: null }
      };

      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockApp)
      });
      (MongoApp.findByIdAndUpdate as any).mockResolvedValue(undefined);
      (MongoAppVersion.create as any).mockResolvedValue([{ _id: 'version_123' }]);

      const { MongoEvalDatasetCollection } = await import(
        '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema'
      );
      const { MongoEvalDatasetData } = await import(
        '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema'
      );
      (MongoEvalDatasetCollection.create as any).mockResolvedValue([
        { _id: 'eval_dataset_123', teamId: mockTeamId, tmbId: mockTmbId }
      ]);
      (MongoEvalDatasetData.insertMany as any).mockResolvedValue([
        { _id: 'eval_data_123', collectionId: 'eval_dataset_123' }
      ]);
      (MongoEvalDatasetData.find as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            userInput: 'Test question',
            retrievalContextsFull: [
              {
                id: 'data_001',
                q: 'Test question',
                a: 'Test answer',
                score: [{ type: 'fullText', value: 1.5, index: 0 }]
              }
            ],
            expectedContextIds: ['data_001']
          }
        ])
      });

      (getRerankModel as any).mockImplementation((modelId: string) => {
        if (modelId === 'base_model_123') {
          return {
            model: 'base_model_123',
            isTuned: true, // 之前的微调模型
            requestUrl: 'http://old.com',
            requestAuth: 'old-key'
          };
        }
        return {
          model: modelId,
          requestUrl: 'http://test.com',
          requestAuth: 'test-key'
        };
      });

      (syntheticRerankEvalData as any).mockResolvedValue({
        success: true,
        data: {
          qaPair: {
            question: 'Test eval question',
            answer: 'Test eval answer'
          }
        }
      });

      // 新模型表现不如之前的模型
      let evalCallCount = 0;
      (evaluateRerank as any).mockImplementation(async () => {
        evalCallCount++;
        if (evalCallCount === 1) {
          // Base model (previous tuned model) evaluation - 表现较好
          return {
            success: true,
            data: {
              runLogs: {
                detailed_results: {
                  overall_ndcg: 0.9, // 之前模型表现更好
                  overall_mrr: 0.92,
                  overall_map: 0.88
                }
              }
            }
          };
        } else {
          // New tuned model evaluation - 表现较差
          return {
            success: true,
            data: {
              runLogs: {
                detailed_results: {
                  overall_ndcg: 0.75, // 新模型表现较差
                  overall_mrr: 0.78,
                  overall_map: 0.72
                }
              }
            }
          };
        }
      });

      const { dispatchDatasetSearch } = await import(
        '@fastgpt/service/core/workflow/dispatch/dataset/search'
      );
      (dispatchDatasetSearch as any).mockResolvedValue({
        data: {
          quoteQA: [
            {
              id: 'data_001',
              q: 'Test question',
              a: 'Test answer',
              score: [{ type: 'embedding', value: 0.95, index: 0 }]
            }
          ]
        }
      });

      let taskState = { ...mockTask };
      const checkpointData: any = {};

      (getRerankTrainTask as any).mockImplementation(async (id: string) => {
        if (id === mockTaskId) {
          return Promise.resolve({
            ...taskState,
            checkpoint: {
              ...taskState.checkpoint,
              data: { ...checkpointData }
            }
          });
        }
        return Promise.resolve(null);
      });

      (updateCheckpointData as any).mockImplementation(
        async (taskId: string, stage: string, data: any, merge: boolean = false) => {
          if (merge) {
            checkpointData[stage] = { ...checkpointData[stage], ...data };
          } else {
            checkpointData[stage] = data;
          }
          return Promise.resolve();
        }
      );

      await rerankTrainTaskProcessor({
        data: {
          taskId: mockTaskId,
          isRetry: false
        },
        attemptsMade: 0,
        opts: {
          attempts: 3
        }
      } as any);

      // 验证删除函数没有被调用（保留之前的微调模型）
      expect(deleteRerankModelConfig).not.toHaveBeenCalledWith('base_model_123');

      // 验证任务最终状态
      expect(updateTaskStatus).toHaveBeenCalledWith(
        mockTaskId,
        RerankTrainTaskStatusEnum.completed
      );
    });

    test('之前模型不是微调模型时，不应该删除', async () => {
      const { updateTaskStatus, updateCheckpointData, getRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/controller'
      );
      const { MongoRerankTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/data/schema'
      );
      const { createRerankModelConfig, deleteRerankModelConfig } = await import(
        '@fastgpt/service/core/train/rerank/model/controller'
      );
      const { createSFTTask, querySFTTaskStatus, syntheticRerankEvalData, evaluateRerank } =
        await import('@fastgpt/service/core/train/rerank/external');
      const { getRerankModel } = await import('@fastgpt/service/core/ai/model');

      const mockTask = createMockTask();
      (getRerankTrainTask as any).mockResolvedValue(mockTask);

      const mockTrainData = [
        {
          _id: 'data_1',
          trainsetId: 'trainset_1',
          query: 'query 1',
          positiveDocs: ['doc 1'],
          negativeDocs: ['doc 2']
        }
      ];
      (MongoRerankTrainsetData.find as any).mockReturnValue({
        cursor: vi.fn().mockReturnValue({
          async *[Symbol.asyncIterator]() {
            for (const item of mockTrainData) {
              yield item;
            }
          }
        })
      });

      (createSFTTask as any).mockResolvedValue({ task_id: 'sft_task_123' });
      (querySFTTaskStatus as any).mockResolvedValue({
        task_id: 'sft_task_123',
        status: 'completed',
        endpoint: {
          base_url: 'http://sft-bridge.com/v1',
          model: 'tuned-model-new',
          api_key: 'sft-bridge-key'
        }
      });

      (createRerankModelConfig as any).mockResolvedValue('new_model_config_123');

      const { MongoApp } = await import('@fastgpt/service/core/app/schema');
      const { MongoAppVersion } = await import('@fastgpt/service/core/app/version/schema');

      const mockApp = {
        _id: mockAppId,
        modules: [
          {
            flowNodeType: 'chatNode',
            inputs: [{ key: 'model', value: 'gpt-4' }]
          },
          {
            flowNodeType: 'datasetSearchNode',
            inputs: [
              {
                key: 'rerankModel',
                value: 'base_model_123' // 基础模型，不是微调模型
              },
              {
                key: 'datasets',
                value: [{ datasetId: 'dataset_001' }]
              }
            ]
          }
        ],
        edges: [],
        chatConfig: {},
        pluginData: { nodeVersion: null }
      };

      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockApp)
      });
      (MongoApp.findByIdAndUpdate as any).mockResolvedValue(undefined);
      (MongoAppVersion.create as any).mockResolvedValue([{ _id: 'version_123' }]);

      const { MongoEvalDatasetCollection } = await import(
        '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema'
      );
      const { MongoEvalDatasetData } = await import(
        '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema'
      );
      (MongoEvalDatasetCollection.create as any).mockResolvedValue([
        { _id: 'eval_dataset_123', teamId: mockTeamId, tmbId: mockTmbId }
      ]);
      (MongoEvalDatasetData.insertMany as any).mockResolvedValue([
        { _id: 'eval_data_123', collectionId: 'eval_dataset_123' }
      ]);
      (MongoEvalDatasetData.find as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            userInput: 'Test question',
            retrievalContextsFull: [
              {
                id: 'data_001',
                q: 'Test question',
                a: 'Test answer',
                score: [{ type: 'fullText', value: 1.5, index: 0 }]
              }
            ],
            expectedContextIds: ['data_001']
          }
        ])
      });

      // 之前的模型不是微调模型（isTuned 不为 true）
      (getRerankModel as any).mockImplementation((modelId: string) => {
        if (modelId === 'base_model_123') {
          return {
            model: 'base_model_123',
            isTuned: false, // 不是微调模型
            requestUrl: 'http://base.com',
            requestAuth: 'base-key'
          };
        }
        return {
          model: modelId,
          requestUrl: 'http://test.com',
          requestAuth: 'test-key'
        };
      });

      (syntheticRerankEvalData as any).mockResolvedValue({
        success: true,
        data: {
          qaPair: {
            question: 'Test eval question',
            answer: 'Test eval answer'
          }
        }
      });

      (evaluateRerank as any).mockResolvedValue({
        success: true,
        data: {
          runLogs: {
            detailed_results: {
              overall_ndcg: 0.85,
              overall_mrr: 0.9,
              overall_map: 0.82
            }
          }
        }
      });

      const { dispatchDatasetSearch } = await import(
        '@fastgpt/service/core/workflow/dispatch/dataset/search'
      );
      (dispatchDatasetSearch as any).mockResolvedValue({
        data: {
          quoteQA: [
            {
              id: 'data_001',
              q: 'Test question',
              a: 'Test answer',
              score: [{ type: 'embedding', value: 0.95, index: 0 }]
            }
          ]
        }
      });

      let taskState = { ...mockTask };
      const checkpointData: any = {};

      (getRerankTrainTask as any).mockImplementation(async (id: string) => {
        if (id === mockTaskId) {
          return Promise.resolve({
            ...taskState,
            checkpoint: {
              ...taskState.checkpoint,
              data: { ...checkpointData }
            }
          });
        }
        return Promise.resolve(null);
      });

      (updateCheckpointData as any).mockImplementation(
        async (taskId: string, stage: string, data: any, merge: boolean = false) => {
          if (merge) {
            checkpointData[stage] = { ...checkpointData[stage], ...data };
          } else {
            checkpointData[stage] = data;
          }
          return Promise.resolve();
        }
      );

      await rerankTrainTaskProcessor({
        data: {
          taskId: mockTaskId,
          isRetry: false
        },
        attemptsMade: 0,
        opts: {
          attempts: 3
        }
      } as any);

      // 验证删除函数没有被调用（不是微调模型，不应该删除）
      expect(deleteRerankModelConfig).not.toHaveBeenCalledWith('base_model_123');

      // 验证任务最终状态
      expect(updateTaskStatus).toHaveBeenCalledWith(
        mockTaskId,
        RerankTrainTaskStatusEnum.completed
      );
    });
  });
});
