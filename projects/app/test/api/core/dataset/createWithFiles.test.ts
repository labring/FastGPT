import { describe, expect, it } from 'vitest';
import handler from '@/pages/api/core/dataset/createWithFiles';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { TeamDatasetCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import type {
  CreateDatasetWithFilesBody,
  CreateDatasetWithFilesResponse
} from '@fastgpt/global/openapi/core/dataset/api';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';

describe('create dataset with files VLM selection', () => {
  it.each([undefined, null, ''])(
    'preserves explicit opt-out instead of restoring the default (%s)',
    async (vlmModelId) => {
      const users = await getFakeUsers(1);
      const owner = users.members[0];
      await MongoResourcePermission.create({
        resourceType: 'team',
        teamId: owner.teamId,
        resourceId: null,
        tmbId: owner.tmbId,
        permission: TeamDatasetCreatePermissionVal
      });
      const previous = global.systemDefaultModel;
      global.systemDefaultModel = {
        ...previous,
        datasetImageLLM: { ...previous.llm!, config: { ...previous.llm!.config, vision: true } }
      };
      try {
        const result = await Call<
          CreateDatasetWithFilesBody,
          Record<string, never>,
          CreateDatasetWithFilesResponse
        >(handler, {
          auth: owner,
          body: { datasetParams: { name: 'create-files', avatar: '', vlmModelId }, files: [] }
        });
        expect(result.code).toBe(200);
        const dataset = await MongoDataset.findById(result.data.datasetId).lean();
        expect(dataset?.vlmModelId).toBe(
          vlmModelId === undefined ? previous.llm!.modelId : undefined
        );
      } finally {
        global.systemDefaultModel = previous;
      }
    }
  );
});
