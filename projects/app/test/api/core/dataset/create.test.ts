import createHandler from '@/pages/api/core/dataset/create';
import type {
  CreateDatasetBody,
  CreateDatasetResponse
} from '@fastgpt/global/openapi/core/dataset/api';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { TeamDatasetCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, it, expect } from 'vitest';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';

describe('create dataset', () => {
  it.each([undefined, null, '', '   '])(
    'only inherits the default VLM when its reference is omitted (%s)',
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
      const previousDefaults = global.systemDefaultModel;
      global.systemDefaultModel = {
        ...previousDefaults,
        datasetImageLLM: {
          ...previousDefaults.llm!,
          config: { ...previousDefaults.llm!.config, vision: true }
        }
      };
      try {
        const res = await Call<CreateDatasetBody, Record<string, never>, CreateDatasetResponse>(
          createHandler,
          {
            auth: owner,
            body: {
              name: 'optional-vision',
              intro: '',
              avatar: '',
              type: DatasetTypeEnum.dataset,
              vlmModelId
            }
          }
        );
        expect(res.code).toBe(200);
        const dataset = await MongoDataset.findById(res.data).lean();
        expect(dataset?.vlmModelId).toBe(
          vlmModelId === undefined ? previousDefaults.llm!.modelId : undefined
        );
      } finally {
        global.systemDefaultModel = previousDefaults;
      }
    }
  );

  it('does not restore a legacy VLM name when the canonical selection is explicitly unset', async () => {
    const users = await getFakeUsers(1);
    const owner = users.members[0];
    await MongoResourcePermission.create({
      resourceType: 'team',
      teamId: owner.teamId,
      resourceId: null,
      tmbId: owner.tmbId,
      permission: TeamDatasetCreatePermissionVal
    });
    const res = await Call<CreateDatasetBody, Record<string, never>, CreateDatasetResponse>(
      createHandler,
      {
        auth: owner,
        body: {
          name: 'unset-vision',
          intro: '',
          avatar: '',
          type: DatasetTypeEnum.dataset,
          vlmModelId: '',
          vlmModel: 'deleted-legacy'
        }
      }
    );
    expect(res.code).toBe(200);
    expect(await MongoDataset.findById(res.data).lean()).not.toHaveProperty('vlmModelId');
  });
  it('should return 200 when create dataset success', async () => {
    const users = await getFakeUsers(2);
    await MongoResourcePermission.create({
      resourceType: 'team',
      teamId: users.members[0].teamId,
      resourceId: null,
      tmbId: users.members[0].tmbId,
      permission: TeamDatasetCreatePermissionVal
    });
    const res = await Call<CreateDatasetBody, Record<string, never>, CreateDatasetResponse>(
      createHandler,
      {
        auth: users.members[0],
        body: {
          name: 'folder',
          intro: 'intro',
          avatar: 'avatar',
          type: DatasetTypeEnum.folder
        }
      }
    );
    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);
    const folderId = res.data as string;

    const res2 = await Call<CreateDatasetBody, Record<string, never>, CreateDatasetResponse>(
      createHandler,
      {
        auth: users.members[0],
        body: {
          name: 'test',
          intro: 'intro',
          avatar: 'avatar',
          type: DatasetTypeEnum.dataset,
          parentId: folderId
        }
      }
    );

    expect(res2.error).toBeUndefined();
    expect(res2.code).toBe(200);
  });
});
