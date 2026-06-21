import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { authEnterpriseAdmin } from '@fastgpt/service/support/enterprise/permission';
import { MongoEnterpriseRoleBinding } from '@fastgpt/service/support/enterprise/rbac/schema';
import { MongoUser } from '@fastgpt/service/support/user/schema';

async function handler(req: ApiRequestProps) {
  const { teamId } = await authEnterpriseAdmin({ req });
  const bindings = await MongoEnterpriseRoleBinding.find({ teamId })
    .sort({ updateTime: -1 })
    .lean();
  const users = await MongoUser.find(
    {
      _id: { $in: bindings.map((item) => item.userId) }
    },
    'username'
  ).lean();
  const userMap = new Map(users.map((user) => [String(user._id), user]));

  return bindings.map((item) => {
    const user = userMap.get(String(item.userId));

    return {
      ...item,
      _id: String(item._id),
      user: user
        ? {
            username: user.username
          }
        : undefined
    };
  });
}

export default NextAPI(handler);
