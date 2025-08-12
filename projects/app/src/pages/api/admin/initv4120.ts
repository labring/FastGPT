import { NextAPI } from '@/service/middleware/entry';
import { AppReadChatLogRoleVal } from '@fastgpt/global/support/permission/app/constant';
import { AppPermission } from '@fastgpt/global/support/permission/app/controller';
import type { AnyBulkWriteOperation } from '@fastgpt/service/common/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { type NextApiRequest, type NextApiResponse } from 'next';
async function handler(req: NextApiRequest, _res: NextApiResponse) {
  await authCert({ req, authRoot: true });

  // 初始化 app 权限：所有有 write 的都加上 readChatLog role
  const rps = await MongoResourcePermission.find({
    resourceType: 'app'
  }).lean();

  const ops: AnyBulkWriteOperation<typeof MongoResourcePermission>[] = [];

  for (const rp of rps) {
    const per = new AppPermission({ role: rp.permission });
    if (per.hasManagePer) {
      per.addRole(AppReadChatLogRoleVal);
      ops.push({
        updateOne: {
          filter: { _id: rp._id },
          update: { $set: { permission: per.role } }
        }
      });
    }
  }

  const result = await MongoResourcePermission.bulkWrite(ops);

  return {
    success: true,
    result
  };
}

export default NextAPI(handler);
