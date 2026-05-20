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

import { rerankTrainTaskProcessor } from '@fastgpt/service/core/train/rerank/task/processor';
import {
  RerankTrainTaskStatusEnum,
  RerankTaskCheckpointStageEnum
} from '@fastgpt/global/core/train/rerank/constants';
import type { RerankTrainTaskSchemaType } from '@fastgpt/global/core/train/rerank/type';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
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

vi.mock('@fastgpt/service/core/train/rerank/task/controller', () => ({
  updateRerankTaskStatus: vi.fn(),
  updateRerankCheckpointStage: vi.fn(),
  updateRerankCheckpointData: vi.fn(),
  getRerankTrainTask: vi.fn(),
  deleteRerankTrainTask: vi.fn()
}));

vi.mock('@fastgpt/service/core/train/common/task-abort-signal', () => ({
  setTrainTaskAbortSignal: vi.fn(),
  getTrainTaskAbortSignal: vi.fn()
}));

vi.mock('@fastgpt/service/core/train/rerank/data/schema', () => ({
  MongoRerankTrainsetData: {
    find: vi.fn().mockReturnValue({
      cursor: vi.fn()
    })
  }
}));

vi.mock('@fastgpt/service/core/dataset/data/schema', () => ({
  MongoDatasetData: {
    find: vi.fn()
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

// Mock ai/config/schema (used by register stage to query base model metadata)
vi.mock('@fastgpt/service/core/ai/config/schema', () => ({
  MongoSystemModel: {
    findOne: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        metadata: {
          charsPointsPrice: 0,
          maxToken: 8192,
          instruction: 'Given a web search query, retrieve relevant passages that answer the query'
        }
      })
    })
  }
}));

// Mock channel module
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
  calculateRerankTrainsetStats: vi.fn()
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

vi.mock('@fastgpt/service/core/train/rerank/external', () => ({
  createSFTTask: vi.fn(),
  querySFTTaskStatus: vi.fn(),
  deleteSFTTask: vi.fn(),
  synthesizeRerankEvalData: vi.fn(),
  judgeRelevantChunks: vi.fn(),
  SFTTaskStatus: {
    pending: 'pending',
    running: 'running',
    completed: 'completed',
    failed: 'failed'
  }
}));

vi.mock('@fastgpt/service/core/train/rerank/task/helpers/evaluate-model', () => ({
  evaluateRerankModelHelper: vi.fn()
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

vi.mock('@fastgpt/service/core/train/rerank/utils', async () => {
  const actual = await vi.importActual('@fastgpt/service/core/train/rerank/utils');
  return {
    ...actual,
    sampleDataFromDataset: vi.fn(),
    fetchSampledContent: vi.fn()
  };
});

vi.mock('@fastgpt/service/core/workflow/dispatch/dataset/search', () => ({
  dispatchDatasetSearch: vi.fn()
}));

describe('Rerank Train Task Processor', () => {
  const mockTaskId = 'task_123';
  const mockTeamId = 'team_123';
  const mockTmbId = 'tmb_123';

  const createMockTask = (
    status: string = RerankTrainTaskStatusEnum.pending,
    stage: string | null = null,
    checkpointData: any = {}
  ): Partial<RerankTrainTaskSchemaType> => ({
    _id: mockTaskId,
    trainsetId: 'trainset_123',
    teamId: mockTeamId,
    tmbId: mockTmbId,
    name: 'Test Rerank Task',
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

    // Mock trainset is ready by default
    const { MongoRerankTrainset } = await import(
      '@fastgpt/service/core/train/rerank/trainset/schema'
    );
    const { calculateRerankTrainsetStats } = await import(
      '@fastgpt/service/core/train/rerank/data/controller'
    );

    (MongoRerankTrainset.findById as any).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: 'trainset_123',
        status: 'ready'
      })
    });

    (calculateRerankTrainsetStats as any).mockResolvedValue({
      dataCount: 10,
      positiveCount: 10,
      negativeCount: 50,
      sourceSummary: []
    });

    // Set default sampleDataFromDataset mock
    const { sampleDataFromDataset, fetchSampledContent } = await import(
      '@fastgpt/service/core/train/rerank/utils'
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
    const { MongoDatasetData } = await import('@fastgpt/service/core/dataset/data/schema');
    (MongoDatasetData.find as any).mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: '507f1f77bcf86cd799439020',
          q: 'Test question 1',
          a: 'Test answer 1'
        },
        {
          _id: '507f1f77bcf86cd799439021',
          q: 'Test question 2',
          a: 'Test answer 2'
        }
      ])
    });

    const { judgeRelevantChunks } = await import('@fastgpt/service/core/train/rerank/external');
    (judgeRelevantChunks as any).mockResolvedValue({
      status: 'success',
      detected_data_ids: ['507f1f77bcf86cd799439020']
    });

    const { getTrainTaskAbortSignal } = await import(
      '@fastgpt/service/core/train/common/task-abort-signal'
    );
    (getTrainTaskAbortSignal as any).mockResolvedValue(null);
  });

  describe('rerankTrainTaskProcessor', () => {
    test('应该成功执行完整的训练任务流程', async () => {
      const {
        updateRerankTaskStatus,
        updateRerankCheckpointStage,
        updateRerankCheckpointData,
        getRerankTrainTask
      } = await import('@fastgpt/service/core/train/rerank/task/controller');
      const { MongoRerankTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/data/schema'
      );
      const { createRerankModelConfig } = await import(
        '@fastgpt/service/core/train/rerank/model/controller'
      );
      const { createSFTTask, querySFTTaskStatus, synthesizeRerankEvalData } = await import(
        '@fastgpt/service/core/train/rerank/external'
      );
      const { evaluateRerankModelHelper } = await import(
        '@fastgpt/service/core/train/rerank/task/helpers/evaluate-model'
      );

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
      // Mock cursor() returns an async iterator
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

      // Mock MongoEvalDatasetData.find for evaluation stage
      (MongoEvalDatasetData.find as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            _id: 'eval_data_123',
            userInput: 'Test eval question',
            retrievalContextsFull: [
              {
                id: '507f1f77bcf86cd799439020',
                q: 'Test question 1',
                a: 'Test answer 1',
                score: [{ type: 'fullText', value: 1.5, index: 0 }]
              }
            ],
            expectedContextIds: ['507f1f77bcf86cd799439020']
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
      (synthesizeRerankEvalData as any).mockResolvedValue({
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
      (evaluateRerankModelHelper as any).mockResolvedValue({
        evalResult: {
          detailed_results: {
            rerank_top10_ndcg: 0.85,
            rerank_top10_mrr: 0.9,
            rerank_top10_precision: 0.82,
            rerank_top10_recall: 0.78
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
            rankedIds: ['507f1f77bcf86cd799439020']
          }
        ]
      });

      // Mock dataset search
      const { dispatchDatasetSearch } = await import(
        '@fastgpt/service/core/workflow/dispatch/dataset/search'
      );
      (dispatchDatasetSearch as any).mockResolvedValue({
        data: {
          quoteQA: [
            {
              id: '507f1f77bcf86cd799439020',
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
      (updateRerankCheckpointData as any).mockImplementation(
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

      // Verify status update
      expect(updateRerankTaskStatus).toHaveBeenCalledWith(
        mockTaskId,
        RerankTrainTaskStatusEnum.running
      );

      // Verify stage execution order (7 stages)
      expect(updateRerankCheckpointStage).toHaveBeenNthCalledWith(
        1,
        mockTaskId,
        RerankTaskCheckpointStageEnum.generate_trainset
      );
      expect(updateRerankCheckpointStage).toHaveBeenNthCalledWith(
        2,
        mockTaskId,
        RerankTaskCheckpointStageEnum.generate_evaldataset
      );
      expect(updateRerankCheckpointStage).toHaveBeenNthCalledWith(
        3,
        mockTaskId,
        RerankTaskCheckpointStageEnum.eval_basemodel
      );
      expect(updateRerankCheckpointStage).toHaveBeenNthCalledWith(
        4,
        mockTaskId,
        RerankTaskCheckpointStageEnum.finetuning
      );
      expect(updateRerankCheckpointStage).toHaveBeenNthCalledWith(
        5,
        mockTaskId,
        RerankTaskCheckpointStageEnum.registering
      );
      expect(updateRerankCheckpointStage).toHaveBeenNthCalledWith(
        6,
        mockTaskId,
        RerankTaskCheckpointStageEnum.eval_tunedmodel
      );
      expect(updateRerankCheckpointStage).toHaveBeenNthCalledWith(
        7,
        mockTaskId,
        RerankTaskCheckpointStageEnum.llm_judge
      );
      expect(updateRerankCheckpointStage).toHaveBeenCalledTimes(7);

      // Verify data preparation stage
      expect(fs.createWriteStream).toHaveBeenCalled();
      expect(MongoRerankTrainsetData.find).toHaveBeenCalledWith({
        trainsetId: 'trainset_123'
      });

      // Verify finetuning stage
      expect(createSFTTask).toHaveBeenCalled();
      expect(querySFTTaskStatus).toHaveBeenCalledWith({
        taskId: 'sft_task_123'
      });

      // Verify registration stage - uses tunedModelId as name
      expect(createRerankModelConfig).toHaveBeenCalledWith({
        name: 'tuned-model', // use tunedModelId directly as name
        endpoint: {
          base_url: 'http://sft-bridge.com/v1',
          api_key: 'sft-brige-key',
          model: 'tuned-model'
        },
        isActive: true,
        charsPointsPrice: 0,
        maxToken: 8192,
        instruction: 'Given a web search query, retrieve relevant passages that answer the query'
      });

      // Verify evaluation stage
      expect(synthesizeRerankEvalData).toHaveBeenCalled(); // called multiple times in generate_evaldataset stage (MIN_EVAL_QA_COUNT)
      expect(evaluateRerankModelHelper).toHaveBeenCalledTimes(2);

      // Verify final result saving contains complete evaluation data
      // Each stage's data is stored under the corresponding checkpointData key
      expect(checkpointData.generate_evaldataset).toBeDefined();
      expect(checkpointData.generate_evaldataset.evalDatasetId).toBe('eval_dataset_123');
      expect(checkpointData.eval_basemodel).toBeDefined();
      expect(checkpointData.eval_basemodel.baseModelEvalResult).toEqual(
        expect.objectContaining({
          detailed_results: {
            rerank_top10_ndcg: 0.85,
            rerank_top10_mrr: 0.9,
            rerank_top10_precision: 0.82,
            rerank_top10_recall: 0.78
          }
        })
      );
      expect(checkpointData.eval_tunedmodel).toBeDefined();
      expect(checkpointData.eval_tunedmodel.tunedModelEvalResult).toEqual(
        expect.objectContaining({
          detailed_results: {
            rerank_top10_ndcg: 0.85,
            rerank_top10_mrr: 0.9,
            rerank_top10_precision: 0.82,
            rerank_top10_recall: 0.78
          }
        })
      );

      // Verify final result saving
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );
      expect(MongoRerankTrainTask.updateOne).toHaveBeenCalledWith(
        { _id: mockTaskId },
        expect.objectContaining({
          result: expect.objectContaining({
            trainDatasetId: expect.any(String),
            trainDatasetFilePath: expect.any(String),
            tunedModelId: 'tuned-model',
            evalDatasetId: 'eval_dataset_123',
            baseModelEvalResult: expect.objectContaining({
              detailed_results: {
                rerank_top10_ndcg: 0.85,
                rerank_top10_mrr: 0.9,
                rerank_top10_precision: 0.82,
                rerank_top10_recall: 0.78
              }
            }),
            tunedModelEvalResult: expect.objectContaining({
              detailed_results: {
                rerank_top10_ndcg: 0.85,
                rerank_top10_mrr: 0.9,
                rerank_top10_precision: 0.82,
                rerank_top10_recall: 0.78
              }
            })
          })
        })
      );
    });

    test('应该正确处理重试逻辑', async () => {
      const {
        updateRerankTaskStatus,
        updateRerankCheckpointStage,
        updateRerankCheckpointData,
        getRerankTrainTask
      } = await import('@fastgpt/service/core/train/rerank/task/controller');

      // Mock a task that completed preparing stage and should start finetuning on retry
      let taskState = createMockTask(
        RerankTrainTaskStatusEnum.running,
        RerankTaskCheckpointStageEnum.generate_trainset, // preparing completed
        {
          generate_trainset: {
            trainDatasetId: 'data_1',
            trainDatasetFilePath: '/tmp/test.jsonl'
          }
          // note: no finetuning data yet since it hasn't been executed
        }
      );
      const checkpointData: any = {
        generate_trainset: {
          trainDatasetId: 'trainset_1', // Updated to training set ID
          trainDatasetFilePath: '/tmp/test.jsonl'
        }
        // note: no finetuning data, about to start execution
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
      (updateRerankCheckpointStage as any).mockResolvedValue(undefined);

      // Mock checkpoint data updates to simulate real database operations
      (updateRerankCheckpointData as any).mockImplementation(
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

      // Mock remaining stages succeed
      const { synthesizeRerankEvalData } = await import(
        '@fastgpt/service/core/train/rerank/external'
      );
      const { evaluateRerankModelHelper } = await import(
        '@fastgpt/service/core/train/rerank/task/helpers/evaluate-model'
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

      // Mock MongoEvalDatasetData.find for eval stage
      (MongoEvalDatasetData.find as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            _id: 'eval_data_123',
            userInput: 'Test eval question',
            retrievalContextsFull: [
              {
                id: '507f1f77bcf86cd799439020',
                q: 'Test question 1',
                a: 'Test answer 1',
                score: [{ type: 'fullText', value: 1.5, index: 0 }]
              }
            ],
            expectedContextIds: ['507f1f77bcf86cd799439020']
          }
        ])
      });

      // Mock getRerankModel
      const { getRerankModel } = await import('@fastgpt/service/core/ai/model');
      if (!(getRerankModel as any).mock) {
        (getRerankModel as any).mockReturnValue({
          model: 'test-rerank-model',
          requestUrl: 'http://test.com',
          requestAuth: 'test-api-key'
        });
      }

      (synthesizeRerankEvalData as any).mockResolvedValue({
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
      (evaluateRerankModelHelper as any).mockResolvedValue({
        evalResult: {
          detailed_results: {
            rerank_top10_ndcg: 0.85,
            rerank_top10_mrr: 0.9,
            rerank_top10_precision: 0.82,
            rerank_top10_recall: 0.78
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
            rankedIds: ['507f1f77bcf86cd799439020']
          }
        ]
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

      // Verify retry stage execution logic (skip completed stages, execute subsequent stages)
      // Since shouldRunStage now uses > relationship, the preparing stage will be skipped
      expect(updateRerankCheckpointStage).not.toHaveBeenCalledWith(
        mockTaskId,
        RerankTaskCheckpointStageEnum.generate_trainset
      );
      expect(updateRerankCheckpointStage).toHaveBeenCalledWith(
        mockTaskId,
        RerankTaskCheckpointStageEnum.finetuning
      );
      expect(updateRerankCheckpointStage).toHaveBeenCalledWith(
        mockTaskId,
        RerankTaskCheckpointStageEnum.registering
      );
      expect(updateRerankCheckpointStage).toHaveBeenCalledWith(
        mockTaskId,
        RerankTaskCheckpointStageEnum.eval_tunedmodel
      );
      expect(updateRerankCheckpointStage).toHaveBeenCalledWith(
        mockTaskId,
        RerankTaskCheckpointStageEnum.llm_judge
      );

      // Verify final result saving
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );
      expect(MongoRerankTrainTask.updateOne).toHaveBeenCalledWith(
        { _id: mockTaskId },
        expect.objectContaining({
          result: expect.objectContaining({
            trainDatasetId: 'trainset_1', // use existing preparing data, not regenerated
            trainDatasetFilePath: '/tmp/test.jsonl', // use existing preparing data, not regenerated
            tunedModelId: 'tuned-model',
            evalDatasetId: 'eval_dataset_123',
            baseModelEvalResult: expect.objectContaining({
              detailed_results: {
                rerank_top10_ndcg: 0.85,
                rerank_top10_mrr: 0.9,
                rerank_top10_precision: 0.82,
                rerank_top10_recall: 0.78
              }
            }),
            tunedModelEvalResult: expect.objectContaining({
              detailed_results: {
                rerank_top10_ndcg: 0.85,
                rerank_top10_mrr: 0.9,
                rerank_top10_precision: 0.82,
                rerank_top10_recall: 0.78
              }
            })
          })
        })
      );
    });

    test('应该正确处理checkpoint数据更新后重新获取任务', async () => {
      const { updateRerankCheckpointStage, updateRerankCheckpointData, getRerankTrainTask } =
        await import('@fastgpt/service/core/train/rerank/task/controller');
      const { MongoRerankTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/data/schema'
      );

      // Mock initial task
      const mockTask = createMockTask();

      // Mock train data - use cursor() to return async iterator
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

      // Use evolving checkpoint data to simulate real database operations
      const checkpointData: any = {};
      (getRerankTrainTask as any).mockImplementation((id: string) => {
        return Promise.resolve({
          ...mockTask,
          checkpoint: {
            ...mockTask.checkpoint,
            data: { ...checkpointData }
          }
        });
      });

      (updateRerankCheckpointData as any).mockImplementation(
        async (taskId: string, stage: string, data: any, merge: boolean = false) => {
          if (merge) {
            checkpointData[stage] = { ...checkpointData[stage], ...data };
          } else {
            checkpointData[stage] = data;
          }
          return Promise.resolve();
        }
      );

      // Mock dependencies needed for generate_evaldataset stage
      const { synthesizeRerankEvalData } = await import(
        '@fastgpt/service/core/train/rerank/external'
      );
      (synthesizeRerankEvalData as any).mockResolvedValue({
        success: true,
        data: {
          qaPairs: [
            {
              question: 'Test question',
              answer: 'Test answer'
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

      // Mock dependencies needed for eval_basemodel stage
      (MongoEvalDatasetData.find as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            userInput: 'Test question',
            retrievalContextsFull: [
              {
                id: '507f1f77bcf86cd799439020',
                q: 'Test q',
                a: 'Test a',
                score: [{ type: 'embedding', value: 0.9, index: 0 }]
              }
            ],
            expectedContextIds: ['507f1f77bcf86cd799439020']
          }
        ])
      });

      const { getRerankModel } = await import('@fastgpt/service/core/ai/model');
      (getRerankModel as any).mockReturnValue({
        model: 'test-rerank-model',
        requestUrl: 'http://test.com',
        requestAuth: 'test-api-key'
      });

      const { evaluateRerankModelHelper } = await import(
        '@fastgpt/service/core/train/rerank/task/helpers/evaluate-model'
      );
      (evaluateRerankModelHelper as any).mockResolvedValue({
        evalResult: {
          detailed_results: { overall_ndcg: 0.8, overall_mrr: 0.85, overall_precision: 0.82 },
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
            rankedIds: ['507f1f77bcf86cd799439020']
          }
        ]
      });

      // Mock SFT operations to fail at finetuning stage
      const { createSFTTask } = await import('@fastgpt/service/core/train/rerank/external');
      (createSFTTask as any).mockRejectedValue(new Error('SFT error'));

      try {
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
        // Should not reach here
        expect.fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TrainTaskRetriableError);
        expect((error as TrainTaskRetriableError).enhancedError.type).toBe(
          RerankTrainErrEnum.rerankFinetuneSftBridgeCreateFailed
        );
      }

      // Verify generate_trainset stage checkpoint data was written
      expect(updateRerankCheckpointData).toHaveBeenCalledWith(
        mockTaskId,
        'generate_trainset',
        expect.objectContaining({
          trainDatasetId: 'trainset_123'
        })
      );
      // Verify task data was re-fetched before entering subsequent stages (called multiple times)
      expect(getRerankTrainTask).toHaveBeenCalled();
    });

    test('SFT queue full should map to queue full error', async () => {
      const { getRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/controller'
      );
      const { MongoRerankTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/data/schema'
      );
      const { createSFTTask } = await import('@fastgpt/service/core/train/rerank/external');

      const mockTask = createMockTask();
      (getRerankTrainTask as any).mockResolvedValue(mockTask);

      (MongoRerankTrainsetData.find as any).mockReturnValue({
        cursor: vi.fn().mockReturnValue({
          async *[Symbol.asyncIterator]() {
            yield {
              _id: 'data_1',
              id: 'data_1',
              q: 'test query',
              a: 'test answer'
            };
          }
        })
      });

      (fs.writeFile as any).mockResolvedValue(undefined);
      (fs.readFile as any).mockResolvedValue(Buffer.from('test data'));
      (createSFTTask as any).mockRejectedValue(
        new Error('SFT Bridge API error: Too many concurrent tasks (max: 3)')
      );

      try {
        await rerankTrainTaskProcessor({
          data: { taskId: mockTaskId, isRetry: false },
          attemptsMade: 0,
          opts: { attempts: 3 }
        } as any);
        expect.fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TrainTaskRetriableError);
        expect((error as TrainTaskRetriableError).enhancedError.type).toBe(
          RerankTrainErrEnum.rerankFinetuneQueueFull
        );
      }
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

      // Mock empty train data - cursor() returns empty async iterator
      (MongoRerankTrainsetData.find as any).mockReturnValue({
        cursor: vi.fn().mockReturnValue({
          async *[Symbol.asyncIterator]() {
            // empty iterator
          }
        })
      });

      try {
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
        // Should not reach here
        expect.fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TrainTaskUnrecoverableError);
        expect((error as TrainTaskUnrecoverableError).enhancedError.type).toBe(
          RerankTrainErrEnum.rerankPrepareDataEmptyAfterWrite
        );
      }
    });

    test('应该正确处理文件清理', async () => {
      const {
        updateRerankTaskStatus,
        updateRerankCheckpointStage,
        updateRerankCheckpointData,
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
      (updateRerankCheckpointData as any).mockImplementation(
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

      // Mock task deletion with file path
      (deleteRerankTrainTask as any).mockImplementation(async (taskId: string) => {
        const task = await getRerankTrainTask(taskId);
        if (task?.result?.trainDatasetFilePath) {
          // use fs.promises mock version
          const fsPromises = await import('fs/promises');
          await fsPromises.unlink(task.result.trainDatasetFilePath);
        }
      });

      // Mock file exists and can be deleted
      (fs.unlink as any).mockResolvedValue(undefined);

      // Mock remaining stages
      const { synthesizeRerankEvalData } = await import(
        '@fastgpt/service/core/train/rerank/external'
      );
      const { evaluateRerankModelHelper } = await import(
        '@fastgpt/service/core/train/rerank/task/helpers/evaluate-model'
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

      // Mock MongoEvalDatasetData.find for eval stage
      (MongoEvalDatasetData.find as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            _id: 'eval_data_123',
            userInput: 'Test eval question',
            retrievalContextsFull: [
              {
                id: '507f1f77bcf86cd799439020',
                q: 'Test question 1',
                a: 'Test answer 1',
                score: [{ type: 'fullText', value: 1.5, index: 0 }]
              }
            ],
            expectedContextIds: ['507f1f77bcf86cd799439020']
          }
        ])
      });

      // Mock getRerankModel
      const { getRerankModel } = await import('@fastgpt/service/core/ai/model');
      if (!(getRerankModel as any).mock) {
        (getRerankModel as any).mockReturnValue({
          model: 'test-rerank-model',
          requestUrl: 'http://test.com',
          requestAuth: 'test-api-key'
        });
      }

      (synthesizeRerankEvalData as any).mockResolvedValue({
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
      (evaluateRerankModelHelper as any).mockResolvedValue({
        evalResult: {
          detailed_results: {
            rerank_top10_ndcg: 0.85,
            rerank_top10_mrr: 0.9,
            rerank_top10_precision: 0.82,
            rerank_top10_recall: 0.78
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
            rankedIds: ['507f1f77bcf86cd799439020']
          }
        ]
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

      // Verify file write and cleanup
      expect(fs.createWriteStream).toHaveBeenCalled();
      // Note: fs.unlink would be called when the task is deleted, not during normal execution

      // Verify final result saving
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );
      expect(MongoRerankTrainTask.updateOne).toHaveBeenCalledWith(
        { _id: mockTaskId },
        expect.objectContaining({
          result: expect.objectContaining({
            trainDatasetId: expect.any(String),
            trainDatasetFilePath: expect.any(String),
            tunedModelId: 'tuned-model',
            evalDatasetId: 'eval_dataset_123',
            baseModelEvalResult: expect.objectContaining({
              detailed_results: {
                rerank_top10_ndcg: 0.85,
                rerank_top10_mrr: 0.9,
                rerank_top10_precision: 0.82,
                rerank_top10_recall: 0.78
              }
            }),
            tunedModelEvalResult: expect.objectContaining({
              detailed_results: {
                rerank_top10_ndcg: 0.85,
                rerank_top10_mrr: 0.9,
                rerank_top10_precision: 0.82,
                rerank_top10_recall: 0.78
              }
            })
          })
        })
      );
    });
  });

  describe('Task Failure Handling', () => {
    test('UnrecoverableError should be thrown (status update handled by worker failed event)', async () => {
      const { getRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/controller'
      );
      const { MongoRerankTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/data/schema'
      );

      const mockTask = createMockTask();
      (getRerankTrainTask as any).mockResolvedValue(mockTask);

      //Mock empty training data, which will trigger UnrecoverableError
      (MongoRerankTrainsetData.find as any).mockReturnValue({
        cursor: vi.fn().mockReturnValue({
          async *[Symbol.asyncIterator]() {
            // Empty cursor
          }
        })
      });

      try {
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
        // Should not reach here
        expect.fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TrainTaskUnrecoverableError);
        expect((error as TrainTaskUnrecoverableError).enhancedError.type).toBe(
          RerankTrainErrEnum.rerankPrepareDataEmptyAfterWrite
        );
      }

      // Note: processor no longer directly updates MongoDB status
      // Status update is handled uniformly by the worker's failed event handler
    });

    test('SFT task failure should throw an error', async () => {
      const { updateRerankCheckpointData, updateRerankCheckpointStage, getRerankTrainTask } =
        await import('@fastgpt/service/core/train/rerank/task/controller');
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
      (updateRerankCheckpointData as any).mockImplementation(
        async (taskId: string, stage: string, data: any, merge: boolean = false) => {
          if (merge) {
            checkpointData[stage] = { ...checkpointData[stage], ...data };
          } else {
            checkpointData[stage] = data;
          }
          return Promise.resolve();
        }
      );

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
        // Should not reach here
        expect.fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TrainTaskUnrecoverableError);
        expect((error as TrainTaskUnrecoverableError).enhancedError.type).toBe(
          RerankTrainErrEnum.rerankFinetuneTrainingFailed
        );
      }

      // Verify stage was updated to preparing
      expect(updateRerankCheckpointStage).toHaveBeenCalledWith(
        mockTaskId,
        RerankTaskCheckpointStageEnum.generate_trainset
      );
    });

    test('SFT polling should stop when task is deleted during finetuning', async () => {
      const { updateRerankCheckpointData, updateRerankCheckpointStage, getRerankTrainTask } =
        await import('@fastgpt/service/core/train/rerank/task/controller');
      const { MongoRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/schema'
      );
      const { createRerankModelConfig } = await import(
        '@fastgpt/service/core/train/rerank/model/controller'
      );
      const { createSFTTask, querySFTTaskStatus } = await import(
        '@fastgpt/service/core/train/rerank/external'
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
          autoGenerated: true
        },
        eval_basemodel: {
          baseModelEvalResult: { detailed_results: {} },
          rankingResults: []
        }
      };
      const mockTask = createMockTask(
        RerankTrainTaskStatusEnum.running,
        RerankTaskCheckpointStageEnum.eval_basemodel,
        checkpointData
      );
      let sftTaskCreated = false;

      (getRerankTrainTask as any).mockImplementation(async (id: string) => {
        if (id !== mockTaskId) return Promise.resolve(null);

        return Promise.resolve({
          ...mockTask,
          checkpoint: {
            ...mockTask.checkpoint,
            data: { ...checkpointData }
          }
        });
      });

      (updateRerankCheckpointData as any).mockImplementation(
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
        expect.fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TrainTaskUnrecoverableError);
        expect((error as TrainTaskUnrecoverableError).enhancedError.type).toBe(
          RerankTrainErrEnum.rerankTaskNotExist
        );
      }

      expect(updateRerankCheckpointData).not.toHaveBeenCalledWith(
        mockTaskId,
        'finetuning',
        expect.anything(),
        expect.anything()
      );
      expect(querySFTTaskStatus).not.toHaveBeenCalled();
      expect(getTrainTaskAbortSignal).toHaveBeenCalledWith({
        type: 'rerank',
        taskId: mockTaskId
      });
      expect(createRerankModelConfig).not.toHaveBeenCalled();
      expect(updateRerankCheckpointStage).not.toHaveBeenCalledWith(
        mockTaskId,
        RerankTaskCheckpointStageEnum.finetuning
      );
      expect(MongoRerankTrainTask.updateOne).not.toHaveBeenCalledWith(
        { _id: mockTaskId },
        expect.objectContaining({
          status: RerankTrainTaskStatusEnum.completed
        })
      );
    });

    test('评测阶段失败应该抛出错误', async () => {
      const { updateRerankCheckpointData, updateRerankCheckpointStage, getRerankTrainTask } =
        await import('@fastgpt/service/core/train/rerank/task/controller');
      const { MongoRerankTrainsetData } = await import(
        '@fastgpt/service/core/train/rerank/data/schema'
      );
      const { createSFTTask, querySFTTaskStatus, synthesizeRerankEvalData } = await import(
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
      (updateRerankCheckpointData as any).mockImplementation(
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

      // Mock model registration success
      (createRerankModelConfig as any).mockResolvedValue('config_123');

      // Mock evaluation dataset generation failure
      (synthesizeRerankEvalData as any).mockResolvedValue({
        success: false,
        error: 'Failed to connect to evaluation service'
      });

      try {
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
        // Should not reach here
        expect.fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TrainTaskRetriableError);
        expect((error as TrainTaskRetriableError).enhancedError.type).toBe(
          RerankTrainErrEnum.rerankEvalDitingGenerationFailed
        );
      }

      // Verify stage was updated to generate_trainset (stage 1 complete, stage 2 failed during eval dataset generation)
      expect(updateRerankCheckpointStage).toHaveBeenCalledWith(
        mockTaskId,
        RerankTaskCheckpointStageEnum.generate_trainset
      );
    });

    test('任务不存在时应该抛出 UnrecoverableError', async () => {
      const { getRerankTrainTask } = await import(
        '@fastgpt/service/core/train/rerank/task/controller'
      );

      // Mock task not found
      (getRerankTrainTask as any).mockResolvedValue(null);

      try {
        await rerankTrainTaskProcessor({
          data: {
            taskId: 'non_existent_task',
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
          RerankTrainErrEnum.rerankProcessorTaskNotFound
        );
      }
    });
  });

  describe('performDatasetSearch', () => {
    test('应该成功执行知识库检索', async () => {
      const { performDatasetSearch } = await import(
        '@fastgpt/service/core/train/rerank/task/helpers/dataset-search'
      );
      const { dispatchDatasetSearch } = await import(
        '@fastgpt/service/core/workflow/dispatch/dataset/search'
      );

      // Create mock task
      const mockTask = createMockTask() as RerankTrainTaskSchemaType;

      // Mock dispatchDatasetSearch return value
      (dispatchDatasetSearch as any).mockResolvedValue({
        data: {
          quoteQA: [
            {
              id: '507f1f77bcf86cd799439020',
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

      // Execute search (using task.datasetIds)
      const results = await performDatasetSearch(
        mockTask,
        ['dataset_001', 'dataset_002'],
        'Test query'
      );

      // Verify results
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        id: '507f1f77bcf86cd799439020',
        score: [{ type: 'embedding', value: 0.95, index: 0 }]
      });
      expect(results[1]).toEqual({
        id: 'context_002',
        score: [{ type: 'rerank', value: 0.88, index: 1 }]
      });

      // Verify dispatchDatasetSearch was called correctly (without rerank)
      expect(dispatchDatasetSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'test',
          params: expect.objectContaining({
            userChatInput: 'Test query',
            rerankModel: undefined,
            usingReRank: false,
            // Verify actual search params from constants are used
            similarity: 0.1,
            limit: 10240,
            searchMode: 'embedding'
          })
        })
      );
    });

    test('应该正确处理空的检索结果', async () => {
      const { performDatasetSearch } = await import(
        '@fastgpt/service/core/train/rerank/task/helpers/dataset-search'
      );
      const { dispatchDatasetSearch } = await import(
        '@fastgpt/service/core/workflow/dispatch/dataset/search'
      );

      const mockTask = createMockTask() as RerankTrainTaskSchemaType;

      // Mock empty search results
      (dispatchDatasetSearch as any).mockResolvedValue({
        data: {
          quoteQA: []
        }
      });

      const results = await performDatasetSearch(
        mockTask,
        ['dataset_001', 'dataset_002'],
        'No results query'
      );

      expect(results).toHaveLength(0);
    });
  });

  describe('runGenerateEvalDataset', () => {
    test('应该成功生成评测数据集', async () => {
      const { runGenerateEvalDatasetStage } = await import(
        '@fastgpt/service/core/train/rerank/task/stages/generate-evaldataset'
      );
      const { sampleDataFromDataset } = await import('@fastgpt/service/core/train/rerank/utils');
      const { synthesizeRerankEvalData } = await import(
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

      // Create mock task
      const mockTask = createMockTask() as RerankTrainTaskSchemaType;

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

      // Mock DiTing generating evaluation QA pairs
      (synthesizeRerankEvalData as any).mockResolvedValue({
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

      // Mock search results
      (dispatchDatasetSearch as any).mockResolvedValue({
        data: {
          quoteQA: [
            {
              id: '507f1f77bcf86cd799439020',
              q: 'Sample question 1',
              a: 'Sample answer 1',
              score: [{ type: 'embedding', value: 0.9, index: 0 }]
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

      // Execute generate eval dataset
      const result = await runGenerateEvalDatasetStage(mockTask);

      // Verify results
      expect(result.evalDatasetId).toBe('eval_collection_123');

      // Verify DiTing API was called using system default model
      expect(synthesizeRerankEvalData).toHaveBeenCalledWith(
        expect.objectContaining({
          llm_config: expect.objectContaining({
            name: 'gpt-4' // should use system default model
          })
        })
      );

      // Verify dataset creation (unified evaluation dataset)
      expect(MongoEvalDatasetCollection.create).toHaveBeenCalledWith([
        expect.objectContaining({
          name: 'Eval Dataset - Task task_123',
          description: expect.stringContaining('Rerank Model Evaluation Dataset'),
          metadata: expect.objectContaining({
            taskId: 'task_123',
            taskName: 'Test Rerank Task',
            sampleSize: expect.any(Number)
          })
        })
      ]);

      // Verify data insertion
      expect(MongoEvalDatasetData.insertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            userInput: 'Generated question 1',
            expectedOutput: 'Generated answer 1',
            retrievalContextsFull: expect.any(Array),
            expectedContextIds: ['507f1f77bcf86cd799439020']
          })
        ])
      );
    });

    test('应该在没有 AI 模型配置时使用系统默认模型', async () => {
      const { runGenerateEvalDatasetStage } = await import(
        '@fastgpt/service/core/train/rerank/task/stages/generate-evaldataset'
      );
      const { sampleDataFromDataset } = await import('@fastgpt/service/core/train/rerank/utils');
      const { synthesizeRerankEvalData } = await import(
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

      // Mock system default model
      (getDefaultLLMModel as any).mockReturnValue({
        model: 'default-llm-model',
        name: 'Default LLM Model'
      });

      // Mock sampled data
      (sampleDataFromDataset as any).mockResolvedValue([
        {
          datasetId: 'dataset_001',
          dataId: '507f1f77bcf86cd799439020',
          collectionId: '507f1f77bcf86cd799439030'
        }
      ]);

      // Mock DiTing generating evaluation QA pairs
      (synthesizeRerankEvalData as any).mockResolvedValue({
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

      // Mock search results
      (dispatchDatasetSearch as any).mockResolvedValue({
        data: {
          quoteQA: [
            {
              id: '507f1f77bcf86cd799439020',
              q: 'Sample question 1',
              a: 'Sample answer 1',
              score: [{ type: 'embedding', value: 0.9, index: 0 }]
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

      // should succeed using system default model
      const result = await runGenerateEvalDatasetStage(mockTask);

      // Verify results
      expect(result.evalDatasetId).toBe('eval_collection_123');

      // Verify system default model was used
      expect(synthesizeRerankEvalData).toHaveBeenCalledWith(
        expect.objectContaining({
          llm_config: expect.objectContaining({
            name: 'default-llm-model' // should use system default model
          })
        })
      );
    });

    test('应该在没有数据可用时抛出错误', async () => {
      const { runGenerateEvalDatasetStage } = await import(
        '@fastgpt/service/core/train/rerank/task/stages/generate-evaldataset'
      );
      const { sampleDataFromDataset } = await import('@fastgpt/service/core/train/rerank/utils');

      const mockTask = createMockTask() as RerankTrainTaskSchemaType;

      // Mock no sampled data
      (sampleDataFromDataset as any).mockResolvedValue([]);

      try {
        await runGenerateEvalDatasetStage(mockTask);
        // Should not reach here
        expect.fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TrainTaskUnrecoverableError);
        expect((error as TrainTaskUnrecoverableError).enhancedError.type).toBe(
          RerankTrainErrEnum.rerankEvalNoDataAvailable
        );
      }
    });
  });
});
