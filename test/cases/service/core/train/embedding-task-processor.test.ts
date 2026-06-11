import { describe, test, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to set environment variables before all module imports
vi.hoisted(() => {
  process.env.DITING_MOCK_ENABLE = 'true';
  process.env.SFT_BRIDGE_MOCK_ENABLE = 'true';
  process.env.TRAIN_MIN_EVAL_QA_COUNT = '1';

  // Set up test environment variables
  process.env.AIPROXY_API_ENDPOINT = 'http://test-aiproxy.com';
  process.env.AIPROXY_API_TOKEN = 'test-token';
  // Set short polling intervals for faster tests
  process.env.SFT_BRIDGE_POLL_INTERVAL = '20'; // 100ms instead of 60s
  process.env.SFT_BRIDGE_MAX_POLLS = '5'; // Reduce max polls
});

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

vi.mock('@fastgpt/service/core/train/common/task-abort-signal', () => ({
  setTrainTaskAbortSignal: vi.fn(),
  getTrainTaskAbortSignal: vi.fn()
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
  getEmbeddingModelById: vi.fn().mockReturnValue({
    charsPointsPrice: 0,
    defaultToken: 512,
    maxToken: 512,
    weight: 0,
    instruction: 'Given a web search query, retrieve relevant passages that answer the query'
  })
}));

vi.mock('@fastgpt/service/core/train/embedding/model/controller', () => ({
  createEmbeddingModelConfig: vi.fn(),
  deleteEmbeddingModelConfig: vi.fn()
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
  EvalDatasetCollectionName: 'eval_dataset_collections',
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

vi.mock('@fastgpt/service/core/dataset/data/schema', () => ({
  MongoDatasetData: {
    find: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/train/embedding/external', () => ({
  createSFTTask: vi.fn(),
  querySFTTaskStatus: vi.fn(),
  deleteSFTTask: vi.fn(),
  synthesizeEmbeddingEvalData: vi.fn(),
  judgeRelevantChunks: vi.fn().mockResolvedValue({
    status: 'success',
    detected_data_ids: ['507f1f77bcf86cd799439020']
  }),
  SFTTaskStatus: {
    pending: 'pending',
    running: 'running',
    completed: 'completed',
    failed: 'failed'
  }
}));

vi.mock('@fastgpt/service/core/train/embedding/task/helpers/evaluate-model', () => ({
  evaluateEmbeddingModelHelper: vi.fn()
}));

vi.mock('@fastgpt/service/core/workflow/dispatch/dataset/search', () => ({
  dispatchDatasetSearch: vi.fn()
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
    sampleDataFromDataset: vi.fn(),
    fetchSampledContent: vi.fn()
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
    const { sampleDataFromDataset, fetchSampledContent } = await import(
      '@fastgpt/service/core/train/embedding/utils'
    );
    (sampleDataFromDataset as any).mockResolvedValue([
      {
        datasetId: 'dataset_001',
        dataId: '507f1f77bcf86cd799439020',
        collectionId: '507f1f77bcf86cd799439030'
      },
      {
        datasetId: 'dataset_002',
        dataId: '507f1f77bcf86cd799439021',
        collectionId: '507f1f77bcf86cd799439031'
      }
    ]);
    (fetchSampledContent as any).mockResolvedValue([
      {
        datasetId: 'dataset_001',
        dataId: '507f1f77bcf86cd799439020',
        collectionId: '507f1f77bcf86cd799439030',
        q: 'mock question 1',
        a: 'mock answer 1'
      },
      {
        datasetId: 'dataset_002',
        dataId: '507f1f77bcf86cd799439021',
        collectionId: '507f1f77bcf86cd799439031',
        q: 'mock question 2',
        a: 'mock answer 2'
      }
    ]);

    const { getTrainTaskAbortSignal } = await import(
      '@fastgpt/service/core/train/common/task-abort-signal'
    );
    (getTrainTaskAbortSignal as any).mockResolvedValue(null);

    const { judgeRelevantChunks } = await import('@fastgpt/service/core/train/embedding/external');
    (judgeRelevantChunks as any).mockResolvedValue({
      status: 'success',
      detected_data_ids: ['data_001']
    });
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
      const { synthesizeEmbeddingEvalData } = await import(
        '@fastgpt/service/core/train/embedding/external'
      );
      const { evaluateEmbeddingModelHelper } = await import(
        '@fastgpt/service/core/train/embedding/task/helpers/evaluate-model'
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
            _id: 'eval_data_123',
            userInput: 'Test eval question',
            expectedContextIds: ['507f1f77bcf86cd799439020']
            // Note: no retrievalContextsFull - embedding difference from rerank
          }
        ])
      });

      // Mock MongoDatasetData for llm-judge batch chunk lookup
      const { MongoDatasetData } = await import('@fastgpt/service/core/dataset/data/schema');
      (MongoDatasetData.find as any).mockReturnValue({
        lean: vi
          .fn()
          .mockResolvedValue([{ _id: 'data_001', q: 'Test question 1', a: 'Test answer 1' }])
      });

      // Mock getEmbeddingModelById
      const { getEmbeddingModelById } = await import('@fastgpt/service/core/ai/model');
      (getEmbeddingModelById as any).mockReturnValue({
        id: 'test-embedding-model',
        model: 'test-embedding-model',
        requestUrl: 'http://test.com',
        requestAuth: 'test-api-key',
        charsPointsPrice: 0,
        defaultToken: 512,
        maxToken: 512,
        weight: 0,
        instruction: 'Given a web search query, retrieve relevant passages that answer the query'
      });

      // Mock eval data synthesis (embedding uses synthesizeEmbeddingEvalData, no dispatchDatasetSearch)
      (synthesizeEmbeddingEvalData as any).mockResolvedValue({
        success: true,
        data: {
          qaPairs: [
            {
              question: 'Test eval question',
              answer: 'Test eval answer'
            }
          ]
        }
      });

      // Mock embedding evaluation (returns embed_top10_mrr etc., not rerank_top10_ndcg)
      (evaluateEmbeddingModelHelper as any).mockResolvedValue({
        evalResult: {
          detailed_results: {
            embed_top5_mrr: 0.88,
            embed_top10_mrr: 0.9,
            embed_top10_precision: 0.82,
            embed_top15_mrr: 0.87
          },
          retrieval_ranks: [],
          total_rows: 1,
          expect_count: 1,
          mrr_scores: {},
          ndcg_scores: {},
          map_scores: {}
        },
        rankingResults: [
          {
            itemId: 'eval_data_123',
            rankedIds: ['data_001']
          }
        ]
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

      // Verify stage execution order (7 stages)
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
      expect(updateEmbeddingCheckpointStage).toHaveBeenNthCalledWith(
        7,
        mockTaskId,
        EmbeddingTaskCheckpointStageEnum.llm_judge
      );
      expect(updateEmbeddingCheckpointStage).toHaveBeenCalledTimes(7);

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
          charsPointsPrice: 0,
          instruction: 'Given a web search query, retrieve relevant passages that answer the query'
        })
      );

      // Verify evaluation: embedding uses synthesizeEmbeddingEvalData (no dispatchDatasetSearch)
      expect(synthesizeEmbeddingEvalData).toHaveBeenCalled();
      expect(evaluateEmbeddingModelHelper).toHaveBeenCalledTimes(2);

      // Verify checkpoint data uses embedding-specific metrics
      expect(checkpointData.generate_evaldataset).toBeDefined();
      expect(checkpointData.generate_evaldataset.evalDatasetId).toBe('eval_dataset_123');
      expect(checkpointData.generate_evaldataset.evalDatasetFilePath).toBeDefined();
      expect(checkpointData.generate_evaldataset.autoGenerated).toBe(true);
      expect(checkpointData.eval_basemodel).toBeDefined();
      expect(checkpointData.eval_basemodel.baseModelEvalResult).toEqual(
        expect.objectContaining({
          detailed_results: {
            embed_top5_mrr: 0.88,
            embed_top10_mrr: 0.9,
            embed_top10_precision: 0.82,
            embed_top15_mrr: 0.87
          }
        })
      );
      expect(checkpointData.eval_tunedmodel).toBeDefined();
      expect(checkpointData.eval_tunedmodel.tunedModelEvalResult).toEqual(
        expect.objectContaining({
          detailed_results: {
            embed_top5_mrr: 0.88,
            embed_top10_mrr: 0.9,
            embed_top10_precision: 0.82,
            embed_top15_mrr: 0.87
          }
        })
      );

      // Verify final result saving
      const { MongoEmbeddingTrainTask } = await import(
        '@fastgpt/service/core/train/embedding/task/schema'
      );
      expect(MongoEmbeddingTrainTask.updateOne).toHaveBeenCalledWith(
        { _id: mockTaskId },
        expect.objectContaining({
          result: expect.objectContaining({
            trainDatasetId: expect.any(String),
            trainDatasetFilePath: expect.any(String),
            tunedModelId: 'config_123',
            evalDatasetId: 'eval_dataset_123',
            baseModelEvalResult: expect.objectContaining({
              detailed_results: {
                embed_top5_mrr: 0.88,
                embed_top10_mrr: 0.9,
                embed_top10_precision: 0.82,
                embed_top15_mrr: 0.87
              }
            }),
            tunedModelEvalResult: expect.objectContaining({
              detailed_results: {
                embed_top5_mrr: 0.88,
                embed_top10_mrr: 0.9,
                embed_top10_precision: 0.82,
                embed_top15_mrr: 0.87
              }
            })
          })
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

      const { synthesizeEmbeddingEvalData } = await import(
        '@fastgpt/service/core/train/embedding/external'
      );
      const { evaluateEmbeddingModelHelper } = await import(
        '@fastgpt/service/core/train/embedding/task/helpers/evaluate-model'
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
            _id: 'eval_data_123',
            userInput: 'Test eval question',
            expectedContextIds: ['507f1f77bcf86cd799439020']
          }
        ])
      });

      // Mock MongoDatasetData for llm-judge batch chunk lookup
      const mockedMongoDatasetData = await import('@fastgpt/service/core/dataset/data/schema');
      (mockedMongoDatasetData.MongoDatasetData.find as any).mockReturnValue({
        lean: vi
          .fn()
          .mockResolvedValue([{ _id: 'data_001', q: 'Test question 1', a: 'Test answer 1' }])
      });

      // Mock getEmbeddingModelById
      const { getEmbeddingModelById } = await import('@fastgpt/service/core/ai/model');
      (getEmbeddingModelById as any).mockReturnValue({
        id: 'test-embedding-model',
        model: 'test-embedding-model',
        requestUrl: 'http://test.com',
        requestAuth: 'test-api-key',
        charsPointsPrice: 0,
        defaultToken: 512,
        maxToken: 512,
        weight: 0,
        instruction: 'Given a web search query, retrieve relevant passages that answer the query'
      });

      (synthesizeEmbeddingEvalData as any).mockResolvedValue({
        success: true,
        data: {
          qaPairs: [
            {
              question: 'Test eval question',
              answer: 'Test eval answer'
            }
          ]
        }
      });
      (evaluateEmbeddingModelHelper as any).mockResolvedValue({
        evalResult: {
          detailed_results: {
            embed_top5_mrr: 0.88,
            embed_top10_mrr: 0.9,
            embed_top10_precision: 0.82,
            embed_top15_mrr: 0.87
          },
          retrieval_ranks: [],
          total_rows: 1,
          expect_count: 1,
          mrr_scores: {},
          ndcg_scores: {},
          map_scores: {}
        },
        rankingResults: [
          {
            itemId: 'eval_data_123',
            rankedIds: ['data_001']
          }
        ]
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
      expect(updateEmbeddingCheckpointStage).toHaveBeenCalledWith(
        mockTaskId,
        EmbeddingTaskCheckpointStageEnum.llm_judge
      );

      // Verify final result uses existing generate_trainset data (not regenerated)
      const { MongoEmbeddingTrainTask } = await import(
        '@fastgpt/service/core/train/embedding/task/schema'
      );
      expect(MongoEmbeddingTrainTask.updateOne).toHaveBeenCalledWith(
        { _id: mockTaskId },
        expect.objectContaining({
          result: expect.objectContaining({
            trainDatasetId: 'trainset_1',
            trainDatasetFilePath: '/tmp/test.jsonl',
            tunedModelId: 'config_123',
            evalDatasetId: 'eval_dataset_123',
            baseModelEvalResult: expect.objectContaining({
              detailed_results: {
                embed_top5_mrr: 0.88,
                embed_top10_mrr: 0.9,
                embed_top10_precision: 0.82,
                embed_top15_mrr: 0.87
              }
            }),
            tunedModelEvalResult: expect.objectContaining({
              detailed_results: {
                embed_top5_mrr: 0.88,
                embed_top10_mrr: 0.9,
                embed_top10_precision: 0.82,
                embed_top15_mrr: 0.87
              }
            })
          })
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

    test('SFT queue full should map to queue full error', async () => {
      const { updateEmbeddingCheckpointData, getEmbeddingTrainTask } = await import(
        '@fastgpt/service/core/train/embedding/task/controller'
      );
      const { MongoEmbeddingTrainsetData } = await import(
        '@fastgpt/service/core/train/embedding/data/schema'
      );
      const { createSFTTask } = await import('@fastgpt/service/core/train/embedding/external');

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

      (MongoEmbeddingTrainsetData.find as any).mockReturnValue({
        cursor: vi.fn().mockReturnValue({
          async *[Symbol.asyncIterator]() {
            yield {
              _id: 'data_1',
              trainsetId: 'trainset_1',
              query: 'test',
              positiveDocs: ['positive'],
              negativeDocs: ['negative']
            };
          }
        })
      });

      (fs.writeFile as any).mockResolvedValue(undefined);
      (fs.readFile as any).mockResolvedValue(Buffer.from('test data'));
      (updateEmbeddingCheckpointData as any).mockImplementation(
        async (_taskId: string, stage: string, data: any, merge: boolean = false) => {
          if (merge) {
            checkpointData[stage] = { ...checkpointData[stage], ...data };
          } else {
            checkpointData[stage] = data;
          }
          return Promise.resolve();
        }
      );
      (createSFTTask as any).mockRejectedValue(
        new Error('SFT Bridge API error: Too many concurrent tasks (max: 3)')
      );

      try {
        await embeddingTrainTaskProcessor({
          data: { taskId: mockTaskId, isRetry: false },
          attemptsMade: 0,
          opts: { attempts: 3 }
        } as any);
        expect.fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TrainTaskRetriableError);
        expect((error as TrainTaskRetriableError).enhancedError.type).toBe(
          EmbeddingTrainErrEnum.embeddingFinetuneQueueFull
        );
      }
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
          qaPairs: [
            {
              question: 'Test eval question',
              answer: 'Test eval answer'
            }
          ]
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
            _id: 'eval_data_123',
            userInput: 'Test eval question',
            expectedContextIds: ['507f1f77bcf86cd799439020']
          }
        ])
      });

      // Mock getEmbeddingModelById for eval_basemodel stage
      const { getEmbeddingModelById } = await import('@fastgpt/service/core/ai/model');
      (getEmbeddingModelById as any).mockReturnValue({
        id: 'test-embedding-model',
        model: 'test-embedding-model',
        requestUrl: 'http://test.com',
        requestAuth: 'test-api-key'
      });

      const { evaluateEmbeddingModelHelper } = await import(
        '@fastgpt/service/core/train/embedding/task/helpers/evaluate-model'
      );
      (evaluateEmbeddingModelHelper as any).mockResolvedValue({
        evalResult: {
          detailed_results: {
            embed_top10_mrr: 0.9,
            embed_top10_precision: 0.82
          },
          retrieval_ranks: [],
          total_rows: 1,
          expect_count: 1,
          mrr_scores: {},
          ndcg_scores: {},
          map_scores: {}
        },
        rankingResults: [
          {
            itemId: 'eval_data_123',
            rankedIds: ['data_001']
          }
        ]
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

    test('SFT polling should stop when task is deleted during finetuning', async () => {
      const {
        updateEmbeddingCheckpointData,
        updateEmbeddingCheckpointStage,
        getEmbeddingTrainTask
      } = await import('@fastgpt/service/core/train/embedding/task/controller');
      const { MongoEmbeddingTrainTask } = await import(
        '@fastgpt/service/core/train/embedding/task/schema'
      );
      const { createEmbeddingModelConfig } = await import(
        '@fastgpt/service/core/train/embedding/model/controller'
      );
      const { createSFTTask, querySFTTaskStatus } = await import(
        '@fastgpt/service/core/train/embedding/external'
      );
      const { getTrainTaskAbortSignal } = await import(
        '@fastgpt/service/core/train/common/task-abort-signal'
      );

      const checkpointData: any = {
        generate_trainset: {
          trainDatasetId: 'trainset_123',
          trainDatasetFilePath: '/tmp/test.jsonl'
        },
        generate_evaldataset: {
          evalDatasetId: 'eval_dataset_123',
          evalDatasetFilePath: '/tmp/eval_dataset.jsonl',
          autoGenerated: true
        },
        eval_basemodel: {
          baseModelEvalResult: { detailed_results: {} },
          rankingResults: []
        }
      };
      const mockTask = createMockTask(
        EmbeddingTrainTaskStatusEnum.running,
        EmbeddingTaskCheckpointStageEnum.eval_basemodel,
        checkpointData
      );
      let sftTaskCreated = false;

      (getEmbeddingTrainTask as any).mockImplementation(async (id: string) => {
        if (id !== mockTaskId) return Promise.resolve(null);

        return Promise.resolve({
          ...mockTask,
          checkpoint: {
            ...mockTask.checkpoint,
            data: { ...checkpointData }
          }
        });
      });

      (updateEmbeddingCheckpointData as any).mockImplementation(
        async (taskId: string, stage: string, data: any, merge: boolean = false) => {
          checkpointData[stage] = merge ? { ...checkpointData[stage], ...data } : data;
        }
      );

      (createSFTTask as any).mockImplementation(async () => {
        sftTaskCreated = true;
        return { task_id: 'sft_task_123' };
      });
      (getTrainTaskAbortSignal as any).mockImplementation(async () =>
        sftTaskCreated ? 'deleted' : null
      );
      (querySFTTaskStatus as any).mockResolvedValue({
        task_id: 'sft_task_123',
        status: 'running'
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
          EmbeddingTrainErrEnum.embeddingTaskNotExist
        );
      }

      expect(updateEmbeddingCheckpointData).toHaveBeenCalledWith(
        mockTaskId,
        'finetuning',
        { sftTaskId: 'sft_task_123' },
        true
      );
      expect(updateEmbeddingCheckpointData).not.toHaveBeenCalledWith(
        mockTaskId,
        'finetuning',
        expect.objectContaining({
          tunedModelEndpoint: expect.anything()
        }),
        expect.anything()
      );
      expect(querySFTTaskStatus).not.toHaveBeenCalled();
      expect(getTrainTaskAbortSignal).toHaveBeenCalledWith({
        type: 'embedding',
        taskId: mockTaskId
      });
      expect(createEmbeddingModelConfig).not.toHaveBeenCalled();
      expect(updateEmbeddingCheckpointStage).not.toHaveBeenCalledWith(
        mockTaskId,
        EmbeddingTaskCheckpointStageEnum.finetuning
      );
      expect(MongoEmbeddingTrainTask.updateOne).not.toHaveBeenCalledWith(
        { _id: mockTaskId },
        expect.objectContaining({
          status: EmbeddingTrainTaskStatusEnum.completed
        })
      );
    });

    test('should reuse checkpoint SFT task when embedding finetuning resumes', async () => {
      const { runFinetuneStage } = await import(
        '@fastgpt/service/core/train/embedding/task/stages/finetune'
      );
      const { createSFTTask, querySFTTaskStatus } = await import(
        '@fastgpt/service/core/train/embedding/external'
      );
      const { updateEmbeddingCheckpointData, getEmbeddingTrainTask } = await import(
        '@fastgpt/service/core/train/embedding/task/controller'
      );
      const fsPromises = await import('fs/promises');

      const mockTask = createMockTask(
        EmbeddingTrainTaskStatusEnum.running,
        EmbeddingTaskCheckpointStageEnum.eval_basemodel,
        {
          finetuning: {
            sftTaskId: 'sft_task_from_checkpoint'
          }
        }
      ) as EmbeddingTrainTaskSchemaType;

      (getEmbeddingTrainTask as any).mockResolvedValue(mockTask);
      (querySFTTaskStatus as any).mockResolvedValue({
        task_id: 'sft_task_from_checkpoint',
        status: 'completed',
        endpoint: {
          base_url: 'http://sft-bridge.com/v1',
          model: 'tuned-model',
          api_key: 'sft-bridge-key'
        }
      });

      const result = await runFinetuneStage(mockTask);

      expect(result.sftTaskId).toBe('sft_task_from_checkpoint');
      expect(createSFTTask).not.toHaveBeenCalled();
      expect(fsPromises.readFile).not.toHaveBeenCalled();
      expect(updateEmbeddingCheckpointData).not.toHaveBeenCalled();
      expect(querySFTTaskStatus).toHaveBeenCalledWith({
        taskId: 'sft_task_from_checkpoint'
      });
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
        '@fastgpt/service/core/train/embedding/task/stages/generate-evalset'
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
          dataId: '507f1f77bcf86cd799439020',
          collectionId: '507f1f77bcf86cd799439030'
        }
      ]);

      // Mock DiTing generating evaluation QA pairs (no dataset search for embedding)
      (synthesizeEmbeddingEvalData as any).mockResolvedValue({
        success: true,
        data: {
          qaPairs: [
            {
              question: 'Generated question 1',
              answer: 'Generated answer 1'
            }
          ]
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
      expect(result.evalDatasetFilePath).toBeDefined();

      // Verify DiTing API was called using system default model
      expect(synthesizeEmbeddingEvalData).toHaveBeenCalledWith(
        expect.objectContaining({
          llm_config: expect.objectContaining({
            name: expect.any(String)
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
            expectedContextIds: ['507f1f77bcf86cd799439020']
          })
        ])
      );
    });

    test('checkpoint已有evalDatasetFilePath时应该复用跳过重新生成', async () => {
      const { runGenerateEvalDatasetStage } = await import(
        '@fastgpt/service/core/train/embedding/task/stages/generate-evalset'
      );

      const mockTask = createMockTask(
        EmbeddingTrainTaskStatusEnum.running,
        EmbeddingTaskCheckpointStageEnum.generate_trainset,
        {
          generate_evaldataset: {
            evalDatasetId: 'eval_dataset_from_checkpoint',
            evalDatasetFilePath: '/tmp/existing_eval.jsonl',
            autoGenerated: true
          }
        }
      ) as EmbeddingTrainTaskSchemaType;

      const result = await runGenerateEvalDatasetStage(mockTask);

      expect(result).toEqual({
        evalDatasetId: 'eval_dataset_from_checkpoint',
        evalDatasetFilePath: '/tmp/existing_eval.jsonl',
        autoGenerated: true
      });
    });

    test('应该在没有数据可用时抛出错误', async () => {
      const { runGenerateEvalDatasetStage } = await import(
        '@fastgpt/service/core/train/embedding/task/stages/generate-evalset'
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
