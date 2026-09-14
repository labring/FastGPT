import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { PerResourceTypeEnum, ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import { Types } from '@fastgpt/service/common/mongo';
import {
  getCollectionPermissionMap,
  getReadableCollectionIds,
  type CollectionPermissionItemType
} from '@fastgpt/service/support/permission/collection/auth';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers } from '@test/datas/users';
import { describe, expect, it } from 'vitest';

describe('collection permission batch resolution', () => {
  it('returns readable collection IDs and resolves their effective roles', async () => {
    const users = await getFakeUsers(1);
    const member = users.members[0];
    const datasetId = new Types.ObjectId();
    const deniedCollectionId = new Types.ObjectId();
    const groupCollectionId = new Types.ObjectId();
    const groupId = String(new Types.ObjectId());
    const collections: CollectionPermissionItemType[] = [
      {
        _id: deniedCollectionId,
        teamId: users.owner.teamId,
        datasetId,
        tmbId: users.owner.tmbId,
        parentId: null,
        inheritPermission: false,
        type: DatasetCollectionTypeEnum.file
      },
      {
        _id: groupCollectionId,
        teamId: users.owner.teamId,
        datasetId,
        tmbId: users.owner.tmbId,
        parentId: null,
        inheritPermission: false,
        type: DatasetCollectionTypeEnum.file
      }
    ];

    await MongoResourcePermission.create([
      {
        resourceType: PerResourceTypeEnum.collection,
        teamId: users.owner.teamId,
        resourceId: String(deniedCollectionId),
        tmbId: member.tmbId,
        permission: ReadRoleVal
      },
      {
        resourceType: PerResourceTypeEnum.collection,
        teamId: users.owner.teamId,
        resourceId: String(deniedCollectionId),
        groupId,
        permission: ReadRoleVal
      },
      {
        resourceType: PerResourceTypeEnum.collection,
        teamId: users.owner.teamId,
        resourceId: String(groupCollectionId),
        groupId,
        permission: ReadRoleVal
      }
    ]);

    const permissionMap = await getCollectionPermissionMap({
      collections,
      teamId: String(users.owner.teamId),
      tmbId: String(member.tmbId),
      groupIds: [groupId],
      orgIds: []
    });
    expect(permissionMap.get(String(deniedCollectionId))).toBe(ReadRoleVal);
    expect(permissionMap.get(String(groupCollectionId))).toBe(ReadRoleVal);

    const readableIds = await getReadableCollectionIds({
      collections,
      teamId: String(users.owner.teamId),
      tmbId: String(member.tmbId),
      groupIds: [groupId],
      orgIds: [],
      datasetPermission: ReadRoleVal,
      hasSetCollectionPermissions: true
    });
    expect(new Set(readableIds)).toEqual(
      new Set([String(deniedCollectionId), String(groupCollectionId)])
    );
  });
});
