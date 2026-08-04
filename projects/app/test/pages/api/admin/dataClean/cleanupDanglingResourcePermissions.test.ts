import { beforeEach, describe, expect, it } from 'vitest';
import { OwnerRoleVal, PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import cleanupDanglingResourcePermissionsHandler from '@/pages/api/admin/dataClean/cleanupDanglingResourcePermissions';
import { getRootUser, getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';

describe('cleanupDanglingResourcePermissions data clean API', () => {
  beforeEach(async () => {
    const user = await getUser(`permission-cleanup-api-${new Types.ObjectId()}`);
    await MongoResourcePermission.collection.insertOne({
      _id: new Types.ObjectId(),
      teamId: new Types.ObjectId(user.teamId),
      tmbId: new Types.ObjectId(user.tmbId),
      resourceType: PerResourceTypeEnum.app,
      resourceId: new Types.ObjectId(),
      permission: OwnerRoleVal
    });
  });

  it('defaults to dry-run when the flag is omitted', async () => {
    const rootUser = await getRootUser();
    const response = await Call(cleanupDanglingResourcePermissionsHandler, {
      auth: rootUser,
      body: {
        batchSize: 4,
        maxScan: 100,
        sampleLimit: 0
      }
    });

    expect(response.error).toBeUndefined();
    expect(response.data).toMatchObject({
      dryRun: true,
      scannedPermissionCount: 1,
      danglingPermissionCount: 1,
      deletedPermissionCount: 0,
      samples: []
    });
    expect(await MongoResourcePermission.countDocuments()).toBe(1);
  });
});
