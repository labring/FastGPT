import createWithFilesHandler from '@/pages/api/core/dataset/createWithFiles';
import type { CreateDatasetWithFilesBody } from '@fastgpt/global/openapi/core/dataset/api';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { TeamDatasetCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('create dataset with files', () => {
  const originalEmbeddingModelIdMap = global.embeddingModelIdMap;
  const originalLlmModelIdMap = global.llmModelIdMap;
  const originalEmbeddingModelNameMap = global.embeddingModelNameMap;
  const originalLlmModelNameMap = global.llmModelNameMap;
  const originalSystemModelIdMap = global.systemModelIdMap;

  beforeEach(() => {
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

  it('rejects a disabled embedding model before creating the dataset', async () => {
    const users = await getFakeUsers(1);
    await MongoResourcePermission.create({
      resourceType: 'team',
      teamId: users.members[0].teamId,
      resourceId: null,
      tmbId: users.members[0].tmbId,
      permission: TeamDatasetCreatePermissionVal
    });

    const embedding = {
      id: 'disabled-embedding',
      type: ModelTypeEnum.embedding,
      isActive: false,
      isSystem: true
    } as any;
    const llm = {
      id: 'active-llm',
      type: ModelTypeEnum.llm,
      isActive: true,
      isSystem: true
    } as any;
    global.embeddingModelIdMap = new Map([[embedding.id, embedding]]);
    global.llmModelIdMap = new Map([[llm.id, llm]]);
    global.systemModelIdMap = new Map([
      [embedding.id, embedding],
      [llm.id, llm]
    ]);

    const response = await Call<CreateDatasetWithFilesBody, Record<string, never>, unknown>(
      createWithFilesHandler,
      {
        auth: users.members[0],
        body: {
          datasetParams: {
            name: 'dataset',
            avatar: '',
            vectorModelId: embedding.id,
            agentModelId: llm.id
          },
          files: []
        }
      }
    );

    expect(response.error).toContain(ModelErrEnum.modelDisabled);
  });
});
