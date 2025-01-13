import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { NextApiRequest, NextApiResponse } from 'next';

/* 
  简单版迁移：直接升级到最新镜像，会去除 MongoDatasetData 里的索引。直接执行这个脚本。
  无缝迁移：
    1. 移动 User 表中的 avatar 字段到 TeamMember 表中。
*/
async function handler(req: NextApiRequest, res: NextApiResponse) {
  await authCert({ req, authRoot: true });
  await moveUserAvatar();
  return { success: true };
}

export default NextAPI(handler);

const moveUserAvatar = async () => {
  try {
    const users = await MongoUser.find({});
    for await (const user of users) {
      await MongoTeamMember.updateOne(
        {
          _id: user._id
        },
        {
          avatar: (user as any).avatar // 删除 avatar 字段, 因为 Type 改了，所以这里不能直接写 user.avatar
        }
      );
    }
    console.log('Move avatar success:', users.length);
  } catch (error) {
    console.error(error);
  }
};
