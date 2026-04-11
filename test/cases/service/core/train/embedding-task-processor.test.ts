import { describe, test, expect, vi, beforeEach } from 'vitest';
import { embeddingTrainTaskProcessor } from '@fastgpt/service/core/train/embedding/task/processor';
import {
  updateEmbeddingTaskStatus,
  updateEmbeddingCheckpointStage,
  updateEmbeddingCheckpointData,
  getEmbeddingTrainTask,
  deleteEmbeddingTrainTask
} from '@fastgpt/service/core/train/embedding/task/controller';
import {
  EmbeddingTrainTaskStatusEnum,
  EmbeddingTaskCheckpointStageEnum
} from '@fastgpt/global/core/train/embedding/constants';
import type { EmbeddingTrainTaskSchemaType } from '@fastgpt/global/core/train/embedding/type';
import { EmbeddingTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import {
  TrainTaskUnrecoverableError,
  TrainTaskRetriableError
} from '@fastgpt/service/core/train/common/errors';
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

vi.mock('@fastgpt/service/core/train/embedding/task/controller', () => ({
  updateEmbeddingTaskStatus: vi.fn(),
  updateEmbeddingCheckpointStage: vi.fn(),
  updateEmbeddingCheckpointData: vi.fn(),
  getEmbeddingTrainTask: vi.fn(),
  deleteEmbeddingTrainTask: vi.fn()
}));

vi.mock('@fastgpt/service/core/train/embedding/data/schema', () => ({
  MongoEmbeddingTrainsetData: {
    find: vi.fn().mockReturnValue({
      cursor: vi.fn()
    })
  }
}));

vi.mock('@fastgpt/service/core/ai/model', () => ({
  createEmbeddingModelConfig: vi.fn(),
  getDefaultLLMModel: vi.fn(),
  getEmbeddingModel: vi.fn()
}));

vi.mock('@fastgpt/service/core/train/embedding/model/controller', () => ({
  createEmbeddingModelConfig: vi.fn(),
  deleteEmbeddingModelConfig: vi.fn()
}));

// Mock ai/config/schema (used by register stage to query base model metadata)
vi.mock('@fastgpt/service/core/ai/config/schema', () => ({
  MongoSystemModel: {
    findOne: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        metadata: {
          charsPointsPrice: 0,
          defaultToken: 512,
          maxToken: 512,
          weight: 0
        }
      })
    })
  }
}));

// Mock channel module
vi.mock('@fastgpt/service/core/train/embedding/task/helpers/channel', () => ({
  createTunedModelChannel: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('@fastgpt/service/core/train/embedding/task/schema', () => ({
  MongoEmbeddingTrainTask: {
    updateOne: vi.fn(),
    findById: vi.fn(),
    findOne: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/train/embedding/trainset/schema', () => ({
  MongoEmbeddingTrainset: {
    findById: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/train/embedding/data/controller', () => ({
  calculateEmbeddingTrainsetStats: vi.fn()
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

vi.mock('@fastgpt/service/core/train/embedding/external', () => ({
  createSFTTask: vi.fn(),
  querySFTTaskStatus: vi.fn(),
  synthesizeEmbeddingEvalData: vi.fn(),
  evaluateEmbeddingModel: vi.fn(),
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
    // also export synchronous versions
    writeFile: vi.fn(),
    readFile: vi.fn(),
    unlink: vi.fn(),
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn()
  };
});

// separately mock fs/promises to support code that directly imports 'fs/promises'
vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from('test data')),
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('@fastgpt/service/core/train/embedding/utils', async () => {
  const actual = await vi.importActual('@fastgpt/service/core/train/embedding/utils');
  return {
    ...actual,
    sampleDataFromDataset: vi.fn()
  };
});

// Mock embeddingTrainDataGenerateQueue to avoid real BullMQ connection
vi.mock('@fastgpt/service/core/train/embedding/data/mq', () => ({
  embeddingTrainDataGenerateQueue: {
    add: vi.fn().mockResolvedValue({ id: 'job_123' })
  }
}));

describe('Embedding Train Task Processor', () => {
  const mockTaskId = 'task_123';
  const mockTeamId = 'team_123';
  const mockTmbId = 'tmb_123';

  const createMockTask = (
    status: string = EmbeddingTrainTaskStatusEnum.pending,
    stage: string | null = null,
    checkpointData: any = {}
  ): Partial<EmbeddingTrainTaskSchemaType> => ({
    _id: mockTaskId,
    trainsetId: 'trainset_123',
    teamId: mockTeamId,
    tmbId: mockTmbId,
    name: 'Test Embedding Task',
    baseModelId: 'base_model_123',
    datasetIds: ['dataset_001', 'dataset_002'],
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
    // Set up test environment variables
    process.env.AIPROXY_API_ENDPOINT = 'http://test-aiproxy.com';
    process.env.AIPROXY_API_TOKEN = 'test-token';
    // Set short polling intervals for faster tests
    process.env.SFT_BRIDGE_POLL_INTERVAL = '100'; // 100ms instead of 60s
    process.env.SFT_BRIDGE_MAX_POLLS = '10'; // Reduce max polls

    // Mock trainset is ready by default
    const { MongoEmbeddingTrainset } = await import(
      '@fastgpt/service/core/train/embedding/trainset/schema'
    );
    const { calculateEmbeddingTrainsetStats } = await import(
      '@fastgpt/service/core/train/embedding/data/controller'
    );

    (MongoEmbeddingTrainset.findById as any).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: 'trainset_123',
        status: 'ready'
      })
    });

    (calculateEmbeddingTrainsetStats as any).mockResolvedValue({
      dataCount: 10,
      positiveCount: 10,
      negativeCount: 50,
      sourceSummary: []
    });

    // Set default sampleDataFromDataset mock
    const { sampleDataFromDataset } = await import('@fastgpt/service/core/train/embedding/utils');
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

  describe('embeddingTrainTaskProcessor', () => {
    test('应该成功执行完整的训练任务流程', async () => {
      const {
        updateEmbeddingTaskStatus,
        updateEmbeddingCheckpointStage,
        updateEmbeddingCheckpointData,
        getEmbeddingTrainTask
      } = await import('@fastgpt/service/core/train/embedding/task/controller');
      const { MongoEmbeddingTrainsetData } = await import(
        '@fastgpt/service/core/train/embedding/data/schema'
      );
      const { createEmbeddingModelConfig } = await import(
        '@fastgpt/service/core/train/embedding/model/controller'
      );
      const { synthesizeEmbeddingEvalData, evaluateEmbeddingModel } = await import(
        '@fastgpt/service/core/train/embedding/external'
      );
      // finetune stage uses embedding external for SFT
      const { createSFTTask, querySFTTaskStatus } = await import(
        '@fastgpt/service/core/train/embedding/external'
      );

      // Mock initial task
      const mockTask = createMockTask();
      (getEmbeddingTrainTask as any).mockResolvedValue(mockTask);

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
          trainsetId: 'trainset_1',
          query: 'query 3',
          positiveDocs: ['doc 5'],
          negativeDocs: ['doc 6']
        }
      ];
      // Mock cursor() returns an async iterator
      (MongoEmbeddingTrainsetData.find as any).mockReturnValue({
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
          api_key: 'sft-bridge-key'
        }
      });

      // Mock model creation
      (createEmbeddingModelConfig as any).mockResolvedValue('config_123');

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

      // Embedding eval data: only expectedContextIds, NO retrievalContextsFull
      (MongoEvalDatasetData.find as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            userInput: 'Test eval question',
            expectedContextIds: ['data_001']
            // Note: no retrievalContextsFull - embedding difference from rerank
          }
        ])
      });

      // Mock getEmbeddingModel
      const { getEmbeddingModel } = await import('@fastgpt/service/core/ai/model');
      (getEmbeddingModel as any).mockReturnValue({
        model: 'test-embedding-model',
        requestUrl: 'http://test.com',
        requestAuth: 'test-api-key'
      });

      // Mock eval data synthesis (embedding uses synthesizeEmbeddingEvalData, no dispatchDatasetSearch)
      (synthesizeEmbeddingEvalData as any).mockResolvedValue({
        success: true,
        data: {
          qaPair: {
            question: 'Test eval question',
            answer: 'Test eval answer'
          }
        }
      });

      // Mock embedding evaluation (returns embed_top10_mrr etc., not rerank_top10_ndcg)
      (evaluateEmbeddingModel as any).mockResolvedValue({
        success: true,
        data: {
          runLogs: {
            detailed_results: {
              embed_top5_mrr: 0.88,
              embed_top10_mrr: 0.9,
              embed_top10_precision: 0.82,
              embed_top15_mrr: 0.87
            }
          }
        }
      });

      // Mock task updates with proper data evolution
      let taskState = { ...mockTask };
      const checkpointData: any = {};

      (getEmbeddingTrainTask as any).mockImplementation(async (id: string) => {
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
      (updateEmbeddingCheckpointData as any).mockImplementation(
        async (taskId: string, stage: string, data: any, merge: boolean = false) => {
          if (merge) {
            checkpointData[stage] = { ...checkpointData[stage], ...data };
          } else {
            checkpointData[stage] = data;
          }
          return Promise.resolve();
        }
      );

      await embeddingTrainTaskProcessor({
        data: {
          taskId: mockTaskId,
          isRetry: false
        },
        attemptsMade: 0,
        opts: {
          attempts: 3
        }
      } as any);

      // Verify status update
      expect(updateEmbeddingTaskStatus).toHaveBeenCalledWith(
        mockTaskId,
        EmbeddingTrainTaskStatusEnum.running
      );

      // Verify stage execution order (6 stages)
      expect(updateEmbeddingCheckpointStage).toHaveBeenNthCalledWith(
        1,
        mockTaskId,
        EmbeddingTaskCheckpointStageEnum.generate_trainset
      );
      expect(updateEmbeddingCheckpointStage).toHaveBeenNthCalledWith(
        2,
        mockTaskId,
        EmbeddingTaskCheckpointStageEnum.generate_evaldataset
      );
      expect(updateEmbeddingCheckpointStage).toHaveBeenNthCalledWith(
        3,
        mockTaskId,
        EmbeddingTaskCheckpointStageEnum.eval_basemodel
      );
      expect(updateEmbeddingCheckpointStage).toHaveBeenNthCalledWith(
        4,
        mockTaskId,
        EmbeddingTaskCheckpointStageEnum.finetuning
      );
      expect(updateEmbeddingCheckpointStage).toHaveBeenNthCalledWith(
        5,
        mockTaskId,
        EmbeddingTaskCheckpointStageEnum.registering
      );
      expect(updateEmbeddingCheckpointStage).toHaveBeenNthCalledWith(
        6,
        mockTaskId,
        EmbeddingTaskCheckpointStageEnum.eval_tunedmodel
      );
      expect(updateEmbeddingCheckpointStage).toHaveBeenCalledTimes(6);

      // Verify data preparation stage
      expect(fs.createWriteStream).toHaveBeenCalled();
      expect(MongoEmbeddingTrainsetData.find).toHaveBeenCalledWith({
        trainsetId: 'trainset_123'
      });

      // Verify finetuning stage
      expect(createSFTTask).toHaveBeenCalled();
      expect(querySFTTaskStatus).toHaveBeenCalledWith({
        taskId: 'sft_task_123'
      });

      // Verify registration stage - uses tunedModelId directly as name
      expect(createEmbeddingModelConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'tuned-model',
          endpoint: {
            base_url: 'http://sft-bridge.com/v1',
            api_key: 'sft-bridge-key',
            model: 'tuned-model'
          },
          isActive: true,
          charsPointsPrice: 0
        })
      );

      // Verify evaluation: embedding uses synthesizeEmbeddingEvalData (no dispatchDatasetSearch)
      expect(synthesizeEmbeddingEvalData).toHaveBeenCalled();
      expect(evaluateEmbeddingModel).toHaveBeenCalledTimes(2);

      // Verify checkpoint data uses embedding-specific metrics
      expect(checkpointData.generate_evaldataset).toBeDefined();
      expect(checkpointData.generate_evaldataset.evalDatasetId).toBe('eval_dataset_123');
      expect(checkpointData.eval_basemodel).toBeDefined();
      expect(checkpointData.eval_basemodel.baseModelEvalResult).toEqual({
        detailed_results: {
          embed_top5_mrr: 0.88,
          embed_top10_mrr: 0.9,
          embed_top10_precision: 0.82,
          embed_top15_mrr: 0.87
        }
      });
      expect(checkpointData.eval_tunedmodel).toBeDefined();
      expect(checkpointData.eval_tunedmodel.tunedModelEvalResult).toEqual({
        detailed_results: {
          embed_top5_mrr: 0.88,
          embed_top10_mrr: 0.9,
          embed_top10_precision: 0.82,
          embed_top15_mrr: 0.87
        }
      });

      // Verify final result saving
      const { MongoEmbeddingTrainTask } = await import(
        '@fastgpt/service/core/train/embedding/task/schema'
      );
      expect(MongoEmbeddingTrainTask.updateOne).toHaveBeenCalledWith(
        { _id: mockTaskId },
        expect.objectContaining({
          result: {
            trainDatasetId: expect.any(String),
            trainDatasetFilePath: expect.any(String),
            tunedModelId: 'tuned-model',
            evalDatasetId: 'eval_dataset_123',
            baseModelEvalResult: {
              detailed_results: {
                embed_top5_mrr: 0.88,
                embed_top10_mrr: 0.9,
                embed_top10_precision: 0.82,
                embed_top15_mrr: 0.87
              }
            },
            tunedModelEvalResult: {
              detailed_results: {
                embed_top5_mrr: 0.88,
                embed_top10_mrr: 0.9,
                embed_top10_precision: 0.82,
                embed_top15_mrr: 0.87
              }
            }
          }
        })
      );
    });

    test('应该正确处理重试逻辑', async () => {
      const {
        updateEmbeddingTaskStatus,
        updateEmbeddingCheckpointStage,
        updateEmbeddingCheckpointData,
        getEmbeddingTrainTask
      } = await import('@fastgpt/service/core/train/embedding/task/controller');

      // Mock a task that completed generate_trainset stage, should continue from generate_evaldataset
      let taskState = createMockTask(
        EmbeddingTrainTaskStatusEnum.running,
        EmbeddingTaskCheckpointStageEnum.generate_trainset, // generate_trainset completed
        {
          generate_trainset: {
            trainDatasetId: 'data_1',
            trainDatasetFilePath: '/tmp/test.jsonl'
          }
        }
      );
      const checkpointData: any = {
        generate_trainset: {
          trainDatasetId: 'trainset_1',
          trainDatasetFilePath: '/tmp/test.jsonl'
        }
      };

      (getEmbeddingTrainTask as any).mockImplementation(async (id: string) => {
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
      (updateEmbeddingCheckpointStage as any).mockResolvedValue(undefined);

      // Mock checkpoint data updates
      (updateEmbeddingCheckpointData as any).mockImplementation(
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
      const { querySFTTaskStatus } = await import('@fastgpt/service/core/train/embedding/external');
      (querySFTTaskStatus as any).mockResolvedValue({
        task_id: 'sft_task_123',
        status: 'completed',
        endpoint: {
          base_url: 'http://sft-bridge.com/v1',
          model: 'tuned-model',
          api_key: 'sft-bridge-key'
        }
      });

      const { synthesizeEmbeddingEvalData, evaluateEmbeddingModel } = await import(
        '@fastgpt/service/core/train/embedding/external'
      );
      const { createEmbeddingModelConfig } = await import(
        '@fastgpt/service/core/train/embedding/model/controller'
      );
      (createEmbeddingModelConfig as any).mockResolvedValue('config_123');

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

      // Embedding eval data: only expectedContextIds, no retrievalContextsFull
      (MongoEvalDatasetData.find as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            userInput: 'Test eval question',
            expectedContextIds: ['data_001']
          }
        ])
      });

      // Mock getEmbeddingModel
      const { getEmbeddingModel } = await import('@fastgpt/service/core/ai/model');
      (getEmbeddingModel as any).mockReturnValue({
        model: 'test-embedding-model',
        requestUrl: 'http://test.com',
        requestAuth: 'test-api-key'
      });

      (synthesizeEmbeddingEvalData as any).mockResolvedValue({
        success: true,
        data: {
          qaPair: {
            question: 'Test eval question',
            answer: 'Test eval answer'
          }
        }
      });
      (evaluateEmbeddingModel as any).mockResolvedValue({
        success: true,
        data: {
          runLogs: {
            detailed_results: {
              embed_top5_mrr: 0.88,
              embed_top10_mrr: 0.9,
              embed_top10_precision: 0.82,
              embed_top15_mrr: 0.87
            }
          }
        }
      });

      await embeddingTrainTaskProcessor({
        data: {
          taskId: mockTaskId,
          isRetry: true
        },
        attemptsMade: 1,
        opts: {
          attempts: 3
        }
      } as any);

      // Verify retry: generate_trainset should be skipped, subsequent stages should execute
      expect(updateEmbeddingCheckpointStage).not.toHaveBeenCalledWith(
        mockTaskId,
        EmbeddingTaskCheckpointStageEnum.generate_trainset
      );
      expect(updateEmbeddingCheckpointStage).toHaveBeenCalledWith(
        mockTaskId,
        EmbeddingTaskCheckpointStageEnum.generate_evaldataset
      );
      expect(updateEmbeddingCheckpointStage).toHaveBeenCalledWith(
        mockTaskId,
        EmbeddingTaskCheckpointStageEnum.finetuning
      );
      expect(updateEmbeddingCheckpointStage).toHaveBeenCalledWith(
        mockTaskId,
        EmbeddingTaskCheckpointStageEnum.registering
      );
      expect(updateEmbeddingCheckpointStage).toHaveBeenCalledWith(
        mockTaskId,
        EmbeddingTaskCheckpointStageEnum.eval_tunedmodel
      );

      // Verify final result uses existing generate_trainset data (not regenerated)
      const { MongoEmbeddingTrainTask } = await import(
        '@fastgpt/service/core/train/embedding/task/schema'
      );
      expect(MongoEmbeddingTrainTask.updateOne).toHaveBeenCalledWith(
        { _id: mockTaskId },
        expect.objectContaining({
          result: {
            trainDatasetId: 'trainset_1',
            trainDatasetFilePath: '/tmp/test.jsonl',
            tunedModelId: 'tuned-model',
            evalDatasetId: 'eval_dataset_123',
            baseModelEvalResult: {
              detailed_results: {
                embed_top5_mrr: 0.88,
                embed_top10_mrr: 0.9,
                embed_top10_precision: 0.82,
                embed_top15_mrr: 0.87
              }
            },
            tunedModelEvalResult: {
              detailed_results: {
                embed_top5_mrr: 0.88,
                embed_top10_mrr: 0.9,
                embed_top10_precision: 0.82,
                embed_top15_mrr: 0.87
              }
            }
          }
        })
      );
    });

    test('应该处理没有训练数据的情况', async () => {
      const { getEmbeddingTrainTask } = await import(
        '@fastgpt/service/core/train/embedding/task/controller'
      );
      const { MongoEmbeddingTrainsetData } = await import(
        '@fastgpt/service/core/train/embedding/data/schema'
      );

      const mockTask = createMockTask();
      (getEmbeddingTrainTask as any).mockResolvedValue(mockTask);

      // Mock empty train data - cursor() returns empty async iterator
      (MongoEmbeddingTrainsetData.find as any).mockReturnValue({
        cursor: vi.fn().mockReturnValue({
          async *[Symbol.asyncIterator]() {
            // empty iterator
          }
        })
      });

      try {
        await embeddingTrainTaskProcessor({
          data: {
            taskId: mockTaskId,
            isRetry: false
          },
          attemptsMade: 0,
          opts: {
            attempts: 3
          }
        } as any);
        // Should not reach here
        expect.fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TrainTaskUnrecoverableError);
        expect((error as TrainTaskUnrecoverableError).enhancedError.type).toBe(
          EmbeddingTrainErrEnum.embeddingPrepareDataEmptyAfterWrite
        );
      }
    });
  });

  describe('Task Failure Handling', () => {
    test('UnrecoverableError should be thrown', async () => {
      const { getEmbeddingTrainTask } = await import(
        '@fastgpt/service/core/train/embedding/task/controller'
      );
      const { MongoEmbeddingTrainsetData } = await import(
        '@fastgpt/service/core/train/embedding/data/schema'
      );

      const mockTask = createMockTask();
      (getEmbeddingTrainTask as any).mockResolvedValue(mockTask);

      // Mock empty training data to trigger UnrecoverableError
      (MongoEmbeddingTrainsetData.find as any).mockReturnValue({
        cursor: vi.fn().mockReturnValue({
          async *[Symbol.asyncIterator]() {
            // Empty cursor
          }
        })
      });

      try {
        await embeddingTrainTaskProcessor({
          data: {
            taskId: mockTaskId,
            isRetry: false
          },
          attemptsMade: 0,
          opts: {
            attempts: 3
          }
        } as any);
        expect.fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TrainTaskUnrecoverableError);
        expect((error as TrainTaskUnrecoverableError).enhancedError.type).toBe(
          EmbeddingTrainErrEnum.embeddingPrepareDataEmptyAfterWrite
        );
      }

      // Note: processor no longer directly updates MongoDB status
      // Status update is handled uniformly by the worker's failed event handler
    });

    test('SFT task failure should throw an error', async () => {
      const {
        updateEmbeddingCheckpointData,
        updateEmbeddingCheckpointStage,
        getEmbeddingTrainTask
      } = await import('@fastgpt/service/core/train/embedding/task/controller');
      const { MongoEmbeddingTrainsetData } = await import(
        '@fastgpt/service/core/train/embedding/data/schema'
      );
      const { createSFTTask, querySFTTaskStatus } = await import(
        '@fastgpt/service/core/train/embedding/external'
      );

      const mockTask = createMockTask();
      const checkpointData: any = {};

      (getEmbeddingTrainTask as any).mockImplementation(async (id: string) => {
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
      (MongoEmbeddingTrainsetData.find as any).mockReturnValue({
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
      (updateEmbeddingCheckpointData as any).mockImplementation(
        async (taskId: string, stage: string, data: any, merge: boolean = false) => {
          if (merge) {
            checkpointData[stage] = { ...checkpointData[stage], ...data };
          } else {
            checkpointData[stage] = data;
          }
          return Promise.resolve();
        }
      );

      // eval data for generate_evaldataset stage
      const { synthesizeEmbeddingEvalData } = await import(
        '@fastgpt/service/core/train/embedding/external'
      );
      (synthesizeEmbeddingEvalData as any).mockResolvedValue({
        success: true,
        data: {
          qaPair: {
            question: 'Test eval question',
            answer: 'Test eval answer'
          }
        }
      });

      const { MongoEvalDatasetCollection } = await import(
        '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema'
      );
      const { MongoEvalDatasetData } = await import(
        '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema'
      );
      (MongoEvalDatasetCollection.create as any).mockResolvedValue([
        { _id: 'eval_dataset_123', teamId: mockTeamId, tmbId: mockTmbId }
      ]);
      (MongoEvalDatasetData.insertMany as any).mockResolvedValue([{ _id: 'eval_data_123' }]);

      // Embedding eval data: only expectedContextIds
      (MongoEvalDatasetData.find as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            userInput: 'Test eval question',
            expectedContextIds: ['data_001']
          }
        ])
      });

      // Mock getEmbeddingModel for eval_basemodel stage
      const { getEmbeddingModel } = await import('@fastgpt/service/core/ai/model');
      (getEmbeddingModel as any).mockReturnValue({
        model: 'test-embedding-model',
        requestUrl: 'http://test.com',
        requestAuth: 'test-api-key'
      });

      const { evaluateEmbeddingModel } = await import(
        '@fastgpt/service/core/train/embedding/external'
      );
      (evaluateEmbeddingModel as any).mockResolvedValue({
        success: true,
        data: {
          runLogs: {
            detailed_results: {
              embed_top10_mrr: 0.9,
              embed_top10_precision: 0.82
            }
          }
        }
      });

      // Mock SFT created successfully but query returns failed status
      (createSFTTask as any).mockResolvedValue({
        task_id: 'sft_task_123'
      });
      (querySFTTaskStatus as any).mockResolvedValue({
        task_id: 'sft_task_123',
        status: 'failed',
        error: 'Training failed due to insufficient data'
      });

      try {
        await embeddingTrainTaskProcessor({
          data: {
            taskId: mockTaskId,
            isRetry: false
          },
          attemptsMade: 0,
          opts: {
            attempts: 3
          }
        } as any);
        expect.fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TrainTaskUnrecoverableError);
        expect((error as TrainTaskUnrecoverableError).enhancedError.type).toBe(
          EmbeddingTrainErrEnum.embeddingFinetuneTrainingFailed
        );
      }

      // Verify stage was updated to generate_trainset
      expect(updateEmbeddingCheckpointStage).toHaveBeenCalledWith(
        mockTaskId,
        EmbeddingTaskCheckpointStageEnum.generate_trainset
      );
    });

    test('评测阶段失败应该抛出错误', async () => {
      const {
        updateEmbeddingCheckpointData,
        updateEmbeddingCheckpointStage,
        getEmbeddingTrainTask
      } = await import('@fastgpt/service/core/train/embedding/task/controller');
      const { MongoEmbeddingTrainsetData } = await import(
        '@fastgpt/service/core/train/embedding/data/schema'
      );
      const { synthesizeEmbeddingEvalData } = await import(
        '@fastgpt/service/core/train/embedding/external'
      );

      const mockTask = createMockTask();
      const checkpointData: any = {};

      (getEmbeddingTrainTask as any).mockImplementation(async (id: string) => {
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
      (MongoEmbeddingTrainsetData.find as any).mockReturnValue({
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
      (updateEmbeddingCheckpointData as any).mockImplementation(
        async (taskId: string, stage: string, data: any, merge: boolean = false) => {
          if (merge) {
            checkpointData[stage] = { ...checkpointData[stage], ...data };
          } else {
            checkpointData[stage] = data;
          }
          return Promise.resolve();
        }
      );

      // Mock evaluation dataset generation failure (synthesizeEmbeddingEvalData returns failure)
      (synthesizeEmbeddingEvalData as any).mockResolvedValue({
        success: false,
        error: 'Failed to connect to evaluation service'
      });

      try {
        await embeddingTrainTaskProcessor({
          data: {
            taskId: mockTaskId,
            isRetry: false
          },
          attemptsMade: 0,
          opts: {
            attempts: 3
          }
        } as any);
        expect.fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TrainTaskRetriableError);
        expect((error as TrainTaskRetriableError).enhancedError.type).toBe(
          EmbeddingTrainErrEnum.embeddingEvalDitingGenerationFailed
        );
      }

      // Verify stage 1 was completed before stage 2 failed
      expect(updateEmbeddingCheckpointStage).toHaveBeenCalledWith(
        mockTaskId,
        EmbeddingTaskCheckpointStageEnum.generate_trainset
      );
    });

    test('任务不存在时应该抛出 UnrecoverableError', async () => {
      const { getEmbeddingTrainTask } = await import(
        '@fastgpt/service/core/train/embedding/task/controller'
      );

      // Mock task not found
      (getEmbeddingTrainTask as any).mockResolvedValue(null);

      try {
        await embeddingTrainTaskProcessor({
          data: {
            taskId: 'non_existent_task',
            isRetry: false
          },
          attemptsMade: 0,
          opts: {
            attempts: 3
          }
        } as any);
        expect.fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TrainTaskUnrecoverableError);
        expect((error as TrainTaskUnrecoverableError).enhancedError.type).toBe(
          EmbeddingTrainErrEnum.embeddingProcessorTaskNotFound
        );
      }
    });
  });

  describe('runGenerateEvalDataset (无 performDatasetSearch)', () => {
    test('应该成功生成评测数据集（无 performDatasetSearch）', async () => {
      const { runGenerateEvalDatasetStage } = await import(
        '@fastgpt/service/core/train/embedding/task/stages/generate-evaldataset'
      );
      const { sampleDataFromDataset } = await import('@fastgpt/service/core/train/embedding/utils');
      const { synthesizeEmbeddingEvalData } = await import(
        '@fastgpt/service/core/train/embedding/external'
      );
      const { MongoEvalDatasetCollection } = await import(
        '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema'
      );
      const { MongoEvalDatasetData } = await import(
        '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema'
      );
      const { getDefaultLLMModel } = await import('@fastgpt/service/core/ai/model');

      // Create mock task
      const mockTask = createMockTask() as EmbeddingTrainTaskSchemaType;

      // Mock system default model
      (getDefaultLLMModel as any).mockReturnValue({
        model: 'gpt-4',
        name: 'GPT-4'
      });

      // Mock sampled data
      (sampleDataFromDataset as any).mockResolvedValue([
        {
          datasetId: 'dataset_001',
          dataId: 'data_001',
          q: 'Sample question 1',
          a: 'Sample answer 1'
        }
      ]);

      // Mock DiTing generating evaluation QA pairs (no dataset search for embedding)
      (synthesizeEmbeddingEvalData as any).mockResolvedValue({
        success: true,
        data: {
          qaPair: {
            question: 'Generated question 1',
            answer: 'Generated answer 1'
          }
        }
      });

      // Mock evaluation dataset creation
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

      // Mock MongoEmbeddingTrainTask.updateOne for writing evalDatasetId back
      const { MongoEmbeddingTrainTask } = await import(
        '@fastgpt/service/core/train/embedding/task/schema'
      );

      const result = await runGenerateEvalDatasetStage(mockTask);

      // Verify results
      expect(result.evalDatasetId).toBe('eval_collection_123');

      // Verify DiTing API was called using system default model
      expect(synthesizeEmbeddingEvalData).toHaveBeenCalledWith(
        expect.objectContaining({
          llm_config: expect.objectContaining({
            name: 'gpt-4'
          })
        })
      );

      // Verify dataset creation (unified evaluation dataset)
      expect(MongoEvalDatasetCollection.create).toHaveBeenCalledWith([
        expect.objectContaining({
          name: 'Eval Dataset - Task task_123',
          description: expect.stringContaining('Embedding Model Evaluation Dataset'),
          metadata: expect.objectContaining({
            taskId: 'task_123',
            taskName: 'Test Embedding Task',
            sampleSize: expect.any(Number)
          })
        })
      ]);

      // Key difference: embedding eval data has NO retrievalContextsFull populated,
      // only expectedContextIds
      expect(MongoEvalDatasetData.insertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            userInput: 'Generated question 1',
            expectedOutput: 'Generated answer 1',
            retrievalContextsFull: [], // embedding: empty array, not populated
            expectedContextIds: ['data_001']
          })
        ])
      );
    });

    test('应该在没有数据可用时抛出错误', async () => {
      const { runGenerateEvalDatasetStage } = await import(
        '@fastgpt/service/core/train/embedding/task/stages/generate-evaldataset'
      );
      const { sampleDataFromDataset } = await import('@fastgpt/service/core/train/embedding/utils');

      const mockTask = createMockTask() as EmbeddingTrainTaskSchemaType;

      // Mock no sampled data
      (sampleDataFromDataset as any).mockResolvedValue([]);

      try {
        await runGenerateEvalDatasetStage(mockTask);
        expect.fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TrainTaskUnrecoverableError);
        expect((error as TrainTaskUnrecoverableError).enhancedError.type).toBe(
          EmbeddingTrainErrEnum.embeddingEvalNoDataAvailable
        );
      }
    });
  });
});
