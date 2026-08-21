import createHandler from '@/pages/api/core/dataset/create';
import type {
  CreateDatasetBody,
  CreateDatasetResponse
} from '@fastgpt/global/openapi/core/dataset/api';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { TeamDatasetCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, it, expect } from 'vitest';

describe('create dataset', () => {
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
          parentId: folderId,
          vlmModel: null
        }
      }
    );

    expect(res2.error).toBeUndefined();
    expect(res2.code).toBe(200);

    const dataset = await MongoDataset.findById(res2.data).lean();
    expect(dataset?.vlmModel).toBeUndefined();
  });
});
