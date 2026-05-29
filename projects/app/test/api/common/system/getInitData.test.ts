import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MongoEmbeddingTrainTask } from '@fastgpt/service/core/train/embedding/task/schema';
import { MongoRerankTrainTask } from '@fastgpt/service/core/train/rerank/task/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { InitDateResponse } from '@/pages/api/common/system/getInitData';
import getInitDataHandler from '@/pages/api/common/system/getInitData';

describe('getInitData API - trainTaskSummary', () => {
  let rootUser: any;

  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    rootUser = await getRootUser();

    // Set up global models with an embedding model and a rerank model
    global.systemActiveDesensitizedModels = [
      {
        id: 'test-embedding-model',
        model: 'test-embedding-model',
        name: 'Test Embedding',
        type: ModelTypeEnum.embedding,
        provider: 'test-provider',
        charsPointsPrice: 0.1,
        defaultToken: 512,
        maxToken: 512,
        weight: 1,
        supportTrain: true
      } as any,
      {
        id: 'test-rerank-model',
        model: 'test-rerank-model',
        name: 'Test Rerank',
        type: ModelTypeEnum.rerank,
        provider: 'test-provider',
        charsPointsPrice: 0.1,
        supportTrain: true
      } as any,
      {
        id: 'test-llm-model',
        model: 'test-llm-model',
        name: 'Test LLM',
        type: ModelTypeEnum.llm,
        provider: 'test-provider',
        charsPointsPrice: 1
      } as any
    ];

    global.systemInitBufferId = 'test-buffer-id';
    global.systemVersion = '1.0.0-test';
    global.feConfigs = { uploadFileMaxSize: 200, uploadFileMaxAmount: 20 } as any;
    global.subPlans = undefined;
    global.systemDefaultModel = {};
    global.ModelProviderRawCache = [];
    global.aiproxyChannelsCache = [];

    // Create a team member for creator name resolution
    await MongoTeamMember.findOneAndUpdate(
      { _id: rootUser.tmbId },
      { name: 'Test Creator' },
      { upsert: true }
    );

    // Create some embedding training tasks
    await MongoEmbeddingTrainTask.create([
      {
        teamId: rootUser.teamId,
        tmbId: rootUser.tmbId,
        baseModelId: 'test-embedding-model',
        baseModelEndpoint: { model: 'test-embedding-model' },
        name: 'Embedding Task 1',
        status: 'completed',
        createTime: new Date('2026-01-01'),
        datasetIds: ['dataset-1']
      },
      {
        teamId: rootUser.teamId,
        tmbId: rootUser.tmbId,
        baseModelId: 'test-embedding-model',
        baseModelEndpoint: { model: 'test-embedding-model' },
        name: 'Embedding Task 2',
        status: 'running',
        createTime: new Date('2026-05-01'),
        datasetIds: ['dataset-2']
      },
      {
        teamId: rootUser.teamId,
        tmbId: rootUser.tmbId,
        baseModelId: 'test-embedding-model',
        baseModelEndpoint: { model: 'test-embedding-model' },
        name: 'Embedding Task 3',
        status: 'failed',
        createTime: new Date('2025-06-01'),
        datasetIds: ['dataset-3']
      }
    ]);

    // Create some rerank training tasks
    await MongoRerankTrainTask.create([
      {
        teamId: rootUser.teamId,
        tmbId: rootUser.tmbId,
        baseModelId: 'test-rerank-model',
        baseModelEndpoint: { model: 'test-rerank-model' },
        name: 'Rerank Task 1',
        status: 'completed',
        createTime: new Date('2026-03-01'),
        datasetIds: ['dataset-r1']
      },
      {
        teamId: rootUser.teamId,
        tmbId: rootUser.tmbId,
        baseModelId: 'test-rerank-model',
        baseModelEndpoint: { model: 'test-rerank-model' },
        name: 'Rerank Task 2',
        status: 'pending',
        createTime: new Date('2026-04-01'),
        datasetIds: ['dataset-r2']
      }
    ]);
  });

  afterEach(async () => {
    await MongoEmbeddingTrainTask.deleteMany({
      teamId: rootUser.teamId,
      baseModelId: { $in: ['test-embedding-model', 'test-rerank-model'] }
    });
    await MongoRerankTrainTask.deleteMany({
      teamId: rootUser.teamId,
      baseModelId: { $in: ['test-embedding-model', 'test-rerank-model'] }
    });
    // Reset global state
    delete (global as any).systemActiveDesensitizedModels;
    delete (global as any).systemInitBufferId;
  });

  it('should return activeModelList with trainTaskSummary for embedding and rerank models', async () => {
    const res = await Call<{}, {}, InitDateResponse>(getInitDataHandler, {
      auth: rootUser
    });

    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);
    expect(res.data?.activeModelList).toBeDefined();

    const activeModels = res.data!.activeModelList!;
    expect(activeModels.length).toBe(3);

    // LLM model should have empty summary
    const llmModel = activeModels.find((m) => m.model === 'test-llm-model')!;
    expect(llmModel).toBeDefined();
    expect((llmModel as any).trainTaskSummary).toEqual({
      totalCount: 0,
      hasRunning: false,
      hasError: false
    });

    // Embedding model should have summary with correct counts
    const embeddingModel = activeModels.find((m) => m.model === 'test-embedding-model')!;
    expect(embeddingModel).toBeDefined();
    const embSummary = (embeddingModel as any).trainTaskSummary;
    expect(embSummary).toBeDefined();
    expect(embSummary.totalCount).toBe(3);
    expect(embSummary.hasRunning).toBe(true);
    expect(embSummary.hasError).toBe(true);

    // Latest task should be the most recent (2026-05-01)
    expect(embSummary.latestTask).toBeDefined();
    expect(embSummary.latestTask.datasetIds).toEqual(['dataset-2']);
    expect(embSummary.latestTask.creatorName).toBeDefined();

    // Rerank model should have summary with correct counts
    const rerankModel = activeModels.find((m) => m.model === 'test-rerank-model')!;
    expect(rerankModel).toBeDefined();
    const rerankSummary = (rerankModel as any).trainTaskSummary;
    expect(rerankSummary).toBeDefined();
    expect(rerankSummary.totalCount).toBe(2);
    expect(rerankSummary.hasRunning).toBe(false);
    expect(rerankSummary.hasError).toBe(false);

    // Latest rerank task (2026-04-01)
    expect(rerankSummary.latestTask).toBeDefined();
    expect(rerankSummary.latestTask.datasetIds).toEqual(['dataset-r2']);
    expect(rerankSummary.latestTask.creatorName).toBeDefined();
  });

  it('should not include trainTaskSummary in response when same bufferId is provided', async () => {
    const res = await Call<{}, { bufferId: string }, InitDateResponse>(getInitDataHandler, {
      auth: rootUser,
      query: { bufferId: 'test-buffer-id' }
    });

    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);
    // When buffer matches, only bufferId and systemVersion are returned
    expect(res.data?.activeModelList).toBeUndefined();
    expect(res.data?.bufferId).toBe('test-buffer-id');
    expect(res.data?.systemVersion).toBe('1.0.0-test');
  });

  it('should keep active system models in activeModelList when source members are resolved', async () => {
    global.systemActiveDesensitizedModels = [
      {
        id: 'system-llm-no-tmb',
        model: 'system-llm-no-tmb',
        name: 'System LLM',
        type: ModelTypeEnum.llm,
        provider: 'test-provider',
        charsPointsPrice: 1,
        isCustom: false,
        isShared: true
      } as any,
      {
        id: 'custom-llm-with-tmb',
        model: 'custom-llm-with-tmb',
        name: 'Custom LLM',
        type: ModelTypeEnum.llm,
        provider: 'test-provider',
        charsPointsPrice: 1,
        isCustom: true,
        isShared: false,
        tmbId: rootUser.tmbId,
        teamId: rootUser.teamId
      } as any
    ];

    const res = await Call<{}, {}, InitDateResponse>(getInitDataHandler, {
      auth: rootUser
    });

    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);
    expect(res.data?.activeModelList?.map((item) => item.id)).toEqual([
      'system-llm-no-tmb',
      'custom-llm-with-tmb'
    ]);
    expect(
      res.data?.activeModelList?.find((item) => item.id === 'system-llm-no-tmb')
    ).toMatchObject({
      name: 'System LLM'
    });
    expect(
      res.data?.activeModelList?.find((item) => item.id === 'custom-llm-with-tmb')?.sourceMember
        ?.name
    ).toBe('Test Creator');
  });
});
