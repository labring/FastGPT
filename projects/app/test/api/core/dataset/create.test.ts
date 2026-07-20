import createHandler from '@/pages/api/core/dataset/create';
import type {
  CreateDatasetBody,
  CreateDatasetResponse
} from '@fastgpt/global/openapi/core/dataset/api';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { EmbeddingModelItemType, LLMModelItemType } from '@fastgpt/global/core/ai/model/type';
import { TeamDatasetCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';

describe('create dataset', () => {
  const originalSystemModelIdMap = global.systemModelIdMap;
  const originalEmbeddingModelIdMap = global.embeddingModelIdMap;
  const originalLlmModelIdMap = global.llmModelIdMap;
  const originalSystemDefaultModel = global.systemDefaultModel;

  const embeddingModel: EmbeddingModelItemType = {
    id: new Types.ObjectId().toString(),
    model: 'test-embedding-default',
    name: 'Test embedding default',
    provider: 'OpenAI',
    type: ModelTypeEnum.embedding,
    isActive: true,
    isSystem: true,
    defaultToken: 512,
    maxToken: 8192,
    weight: 1
  };
  const explicitEmbeddingModel: EmbeddingModelItemType = {
    ...embeddingModel,
    id: new Types.ObjectId().toString(),
    model: 'test-embedding-explicit',
    name: 'Test embedding explicit'
  };
  const llmModel: LLMModelItemType = {
    id: new Types.ObjectId().toString(),
    model: 'test-dataset-llm',
    name: 'Test dataset LLM',
    provider: 'OpenAI',
    type: ModelTypeEnum.llm,
    isActive: true,
    isSystem: true,
    maxContext: 32768,
    maxResponse: 4096,
    quoteMaxToken: 16384,
    functionCall: true,
    toolChoice: true
  };

  beforeEach(() => {
    global.embeddingModelIdMap = new Map([
      [embeddingModel.id, embeddingModel],
      [explicitEmbeddingModel.id, explicitEmbeddingModel]
    ]);
    global.llmModelIdMap = new Map([[llmModel.id, llmModel]]);
    global.systemModelIdMap = new Map([
      [embeddingModel.id, embeddingModel],
      [explicitEmbeddingModel.id, explicitEmbeddingModel],
      [llmModel.id, llmModel]
    ]);
    global.systemDefaultModel = {
      ...originalSystemDefaultModel,
      embedding: embeddingModel,
      datasetTextLLM: llmModel
    };
  });

  afterEach(() => {
    global.systemModelIdMap = originalSystemModelIdMap;
    global.embeddingModelIdMap = originalEmbeddingModelIdMap;
    global.llmModelIdMap = originalLlmModelIdMap;
    global.systemDefaultModel = originalSystemDefaultModel;
  });

  const grantCreatePermission = async () => {
    const users = await getFakeUsers(2);
    await MongoResourcePermission.create({
      resourceType: 'team',
      teamId: users.members[0].teamId,
      resourceId: null,
      tmbId: users.members[0].tmbId,
      permission: TeamDatasetCreatePermissionVal
    });
    return users.members[0];
  };

  it('creates a folder and a dataset under that folder', async () => {
    const member = await grantCreatePermission();
    const folderRes = await Call<CreateDatasetBody, Record<string, never>, CreateDatasetResponse>(
      createHandler,
      {
        auth: member,
        body: {
          name: 'folder',
          intro: 'intro',
          avatar: 'avatar',
          type: DatasetTypeEnum.folder
        }
      }
    );

    expect(folderRes.error).toBeUndefined();
    expect(folderRes.code).toBe(200);

    const datasetRes = await Call<CreateDatasetBody, Record<string, never>, CreateDatasetResponse>(
      createHandler,
      {
        auth: member,
        body: {
          name: 'dataset-under-folder',
          intro: 'intro',
          avatar: 'avatar',
          type: DatasetTypeEnum.dataset,
          parentId: folderRes.data as string
        }
      }
    );

    expect(datasetRes.error).toBeUndefined();
    expect(datasetRes.code).toBe(200);
  });

  it('uses the configured defaults when model ids are omitted', async () => {
    const member = await grantCreatePermission();
    const res = await Call<CreateDatasetBody, Record<string, never>, CreateDatasetResponse>(
      createHandler,
      {
        auth: member,
        body: {
          name: 'default-model-dataset',
          intro: 'intro',
          avatar: 'avatar',
          type: DatasetTypeEnum.dataset
        }
      }
    );

    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);
  });

  it('accepts explicit accessible model ids', async () => {
    const member = await grantCreatePermission();
    const res = await Call<CreateDatasetBody, Record<string, never>, CreateDatasetResponse>(
      createHandler,
      {
        auth: member,
        body: {
          name: 'explicit-model-dataset',
          intro: 'intro',
          avatar: 'avatar',
          type: DatasetTypeEnum.dataset,
          vectorModelId: explicitEmbeddingModel.id,
          agentModelId: llmModel.id
        }
      }
    );

    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);
  });

  it('rejects a disabled explicit model', async () => {
    const member = await grantCreatePermission();
    global.embeddingModelIdMap.set(explicitEmbeddingModel.id, {
      ...explicitEmbeddingModel,
      isActive: false
    });

    const res = await Call<CreateDatasetBody, Record<string, never>, CreateDatasetResponse>(
      createHandler,
      {
        auth: member,
        body: {
          name: 'disabled-model-dataset',
          intro: 'intro',
          avatar: 'avatar',
          type: DatasetTypeEnum.dataset,
          vectorModelId: explicitEmbeddingModel.id,
          agentModelId: llmModel.id
        }
      }
    );

    expect(res.code).toBe(500);
    expect(res.error).toBe(ModelErrEnum.modelDisabled);
  });
});
