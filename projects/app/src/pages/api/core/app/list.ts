import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { authUser } from '@fastgpt/service/support/user/auth';
import { mongoRPermission } from '@fastgpt/global/support/permission/utils';
import { AppListItemType } from '@fastgpt/global/core/app/type';
import { getTeamInfoByUIdAndTmbId } from '@/service/support/user/team/controller';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    // 凭证校验
    const { userId, teamId, tmbId } = await authUser({ req, authToken: true, per: 'r' });

    // 根据 userId 获取模型信息
    const [myApps, team] = await Promise.all([
      MongoApp.find(
        { ...mongoRPermission({ teamId, tmbId }) },
        '_id avatar name intro tmbId permission'
      ).sort({
        updateTime: -1
      }),
      getTeamInfoByUIdAndTmbId(userId, tmbId)
    ]);

    jsonRes<AppListItemType[]>(res, {
      data: myApps.map((app) => ({
        _id: app._id,
        avatar: app.avatar,
        name: app.name,
        intro: app.intro,
        isOwner: String(app.tmbId) === tmbId,
        canWrite: team.role !== TeamMemberRoleEnum.visitor,
        permission: app.permission
      }))
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
