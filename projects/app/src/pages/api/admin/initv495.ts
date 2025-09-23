import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { type NextApiRequest, type NextApiResponse } from 'next';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import {
  TeamApikeyCreatePermissionVal,
  TeamAppCreatePermissionVal,
  TeamDatasetCreatePermissionVal
} from '@fastgpt/global/support/permission/user/constant';
import { retryFn } from '@fastgpt/global/common/system/utils';

async function handler(req: NextApiRequest, _res: NextApiResponse) {
  await authCert({ req, authRoot: true });
  // 更新团队权限：
  // 目前所有有 TeamWritePermission 的，都需要添加三个新的权限。

  const rps = await MongoResourcePermission.find({
    resourceType: 'team',
    teamId: { $exists: true },
    resourceId: null
  });

  for await (const rp of rps) {
    const per = rp.permission;
    console.log(per);
    if (per & 0b010) {
      // has 0b010
      rp.permission =
        per |
        TeamAppCreatePermissionVal |
        TeamDatasetCreatePermissionVal |
        TeamApikeyCreatePermissionVal;

      try {
        await retryFn(async () => {
          await rp.save();
        });
      } catch (error) {
        console.log('更新权限异常', error);
      }
    }
  }

  return { success: true };
}

export default NextAPI(handler);
