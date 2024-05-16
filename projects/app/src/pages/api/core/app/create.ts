import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import type { CreateAppParams } from '@/global/core/app/api.d';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { authUserNotVisitor } from '@fastgpt/service/support/permission/auth/user';
import { checkTeamAppLimit } from '@fastgpt/service/support/permission/teamLimit';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoAppVersion } from '@fastgpt/service/core/app/versionSchema';
import { NextAPI } from '@/service/middleware/entry';

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  const {
    name = 'APP',
    avatar,
    type = AppTypeEnum.advanced,
    modules,
    edges
  } = req.body as CreateAppParams;

  if (!name || !Array.isArray(modules)) {
    throw new Error('缺少参数');
  }

  // 凭证校验
  const { teamId, tmbId } = await authUserNotVisitor({ req, authToken: true });

  // 上限校验
  await checkTeamAppLimit(teamId);

  // 创建模型
  const appId = await mongoSessionRun(async (session) => {
    const [{ _id: appId }] = await MongoApp.create(
      [
        {
          avatar,
          name,
          teamId,
          tmbId,
          modules,
          edges,
          type,
          version: 'v2'
        }
      ],
      { session }
    );

    await MongoAppVersion.create(
      [
        {
          appId,
          nodes: modules,
          edges
        }
      ],
      { session }
    );

    return appId;
  });

  jsonRes(res, {
    data: appId
  });
}

export default NextAPI(handler);
