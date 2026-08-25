import updateHandler from '@/pages/api/core/dataset/update';
import type { UpdateDatasetBody } from '@fastgpt/global/openapi/core/dataset/api';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { TeamDatasetCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';

describe('update dataset', () => {
  const originalEmbeddingModelIdMap = global.embeddingModelIdMap;
  const originalLlmModelIdMap = global.llmModelIdMap;
  const originalEmbeddingModelNameMap = global.embeddingModelNameMap;
  const originalLlmModelNameMap = global.llmModelNameMap;
  const originalSystemModelIdMap = global.systemModelIdMap;

  beforeEach(async () => {
    // Clean up any datasets created during tests
    await MongoDataset.deleteMany({});
    global.embeddingModelIdMap = new Map();
    global.llmModelIdMap = new Map();
    global.embeddingModelNameMap = new Map();
    global.llmModelNameMap = new Map();
    global.systemModelIdMap = new Map();
  });

  afterEach(() => {
    global.embeddingModelIdMap = originalEmbeddingModelIdMap;
    global.llmModelIdMap = originalLlmModelIdMap;
    global.embeddingModelNameMap = originalEmbeddingModelNameMap;
    global.llmModelNameMap = originalLlmModelNameMap;
    global.systemModelIdMap = originalSystemModelIdMap;
  });

  it('rejects a disabled embedding model before updating the dataset', async () => {
    const users = await getFakeUsers(1);
    const currentEmbedding = {
      id: 'current-embedding',
      type: ModelTypeEnum.embedding,
      isActive: true,
      isSystem: true
    } as any;
    const disabledEmbedding = {
      ...currentEmbedding,
      id: 'disabled-embedding',
      isActive: false
    };
    const llm = {
      id: 'current-llm',
      type: ModelTypeEnum.llm,
      isActive: true,
      isSystem: true
    } as any;
    global.embeddingModelIdMap = new Map([
      [currentEmbedding.id, currentEmbedding],
      [disabledEmbedding.id, disabledEmbedding]
    ]);
    global.llmModelIdMap = new Map([[llm.id, llm]]);
    global.systemModelIdMap = new Map([
      [currentEmbedding.id, currentEmbedding],
      [disabledEmbedding.id, disabledEmbedding],
      [llm.id, llm]
    ]);

    const dataset = await MongoDataset.create({
      teamId: users.members[0].teamId,
      tmbId: users.members[0].tmbId,
      name: 'dataset',
      type: DatasetTypeEnum.dataset,
      vectorModelId: currentEmbedding.id,
      agentModelId: llm.id
    });

    const response = await Call<UpdateDatasetBody, Record<string, never>, string>(updateHandler, {
      auth: users.members[0],
      body: { id: String(dataset._id), vectorModelId: disabledEmbedding.id }
    });

    expect(response.error).toContain(ModelErrEnum.modelDisabled);
    expect((await MongoDataset.findById(dataset._id).lean())?.vectorModelId).toBe(
      currentEmbedding.id
    );
  });

  it('should return 200 when update dataset with token auth', async () => {
    const users = await getFakeUsers(1);
    await MongoResourcePermission.create({
      resourceType: 'team',
      teamId: users.members[0].teamId,
      resourceId: null,
      tmbId: users.members[0].tmbId,
      permission: TeamDatasetCreatePermissionVal
    });

    // Create a dataset first
    // Create a dataset via raw Mongo for testing update
    const dataset = await MongoDataset.create({
      teamId: users.members[0].teamId,
      tmbId: users.members[0].tmbId,
      name: 'old-name',
      type: DatasetTypeEnum.dataset,
      vectorModelId: 'text-embedding-ada-002',
      agentModelId: 'gpt-5'
    });

    const res = await Call<UpdateDatasetBody, Record<string, never>, string>(updateHandler, {
      auth: users.members[0],
      body: {
        id: String(dataset._id),
        name: 'updated-name'
      }
    });

    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);
  });

  it('should return 200 when update dataset with API Key auth (#7006)', async () => {
    const users = await getFakeUsers(1);

    // Create a dataset
    const dataset = await MongoDataset.create({
      teamId: users.members[0].teamId,
      tmbId: users.members[0].tmbId,
      name: 'old-name',
      type: DatasetTypeEnum.dataset,
      vectorModelId: 'text-embedding-ada-002',
      agentModelId: 'gpt-5'
    });

    // Verify authType is not apikey - this test ensures authApiKey flag is respected
    // by the parseHeaderCert mock which grants access based on the auth object
    const apikeyAuth = {
      ...users.members[0],
      authType: 'apikey' as const,
      apikey: 'test-api-key'
    };

    const res = await Call<UpdateDatasetBody, Record<string, never>, string>(updateHandler, {
      auth: apikeyAuth,
      body: {
        id: String(dataset._id),
        name: 'updated-by-apikey'
      }
    });

    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);
  });
});
