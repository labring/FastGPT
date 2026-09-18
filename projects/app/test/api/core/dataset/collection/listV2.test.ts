import listHandler from '@/pages/api/core/dataset/collection/listV2';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { OwnerRoleVal } from '@fastgpt/global/support/permission/constant';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

describe('collection listV2 permission', () => {
  it('returns owner permission for the team owner on a collection owned by another member', async () => {
    const users = await getFakeUsers(1);
    const member = users.members[0];
    const dataset = await MongoDataset.create({
      name: 'team-owner-list-permission',
      teamId: users.owner.teamId,
      tmbId: member.tmbId,
      vectorModel: 'test',
      agentModel: 'test',
      collectionPermissionEnabled: true
    });
    const collection = await MongoDatasetCollection.create({
      name: 'owned-by-member',
      type: DatasetCollectionTypeEnum.file,
      teamId: users.owner.teamId,
      tmbId: member.tmbId,
      datasetId: dataset._id
    });

    const response = await Call(listHandler, {
      auth: users.owner,
      body: {
        datasetId: dataset._id,
        pageSize: 10,
        offset: 0,
        filterTags: []
      }
    });

    expect(response.code).toBe(200);
    // 列表返回权限必须与详情鉴权一致：团队 owner 短路为 owner，不能 cap 到 manage
    expect(
      response.data.list.find((item) => String(item._id) === String(collection._id))?.permission
    ).toMatchObject({
      role: OwnerRoleVal,
      hasManagePer: true
    });
  });
});
