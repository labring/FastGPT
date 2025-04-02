import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { NextApiRequest, NextApiResponse } from 'next';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import {
  TeamApikeyCreatePermissionVal,
  TeamAppCreatePermissionVal,
  TeamDatasetCreatePermissionVal
} from '@fastgpt/global/support/permission/user/constant';

async function handler(req: NextApiRequest, _res: NextApiResponse) {
  await authCert({ req, authRoot: true });
  // 更新团队权限：
  // 目前所有有 TeamWritePermission 的，都需要添加三个新的权限。

  const rps = await MongoResourcePermission.find({
    resourceType: 'team',
    teamId: { $exists: true },
    resourceId: null
  });

  for (const rp of rps) {
    const per = new TeamPermission({ per: rp.permission });
    if (per.hasWritePer) {
      const newPer = per.addPer(
        TeamAppCreatePermissionVal,
        TeamDatasetCreatePermissionVal,
        TeamApikeyCreatePermissionVal
      );
      rp.permission = newPer.value;
      rp.save();
    }
  }

  return { success: true };
}

export default NextAPI(handler);
