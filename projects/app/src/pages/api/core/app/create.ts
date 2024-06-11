import type { NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { checkTeamAppLimit } from '@fastgpt/service/support/permission/teamLimit';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import type { AppSchema } from '@fastgpt/global/core/app/type';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';

export type CreateAppBody = {
  parentId?: ParentIdType;
  name?: string;
  avatar?: string;
  type?: AppTypeEnum;
  modules: AppSchema['modules'];
  edges?: AppSchema['edges'];
};

async function handler(req: ApiRequestProps<CreateAppBody>, res: NextApiResponse<any>) {
  const { parentId, name, avatar, type, modules, edges } = req.body;

  if (!name || !type || !Array.isArray(modules)) {
    throw new Error('缺少参数');
  }

  // 凭证校验
  const { teamId, tmbId } = await authUserPer({ req, authToken: true, per: WritePermissionVal });

  // 上限校验
  await checkTeamAppLimit(teamId);

  // 创建模型
  const appId = await mongoSessionRun(async (session) => {
    const [{ _id: appId }] = await MongoApp.create(
      [
        {
          ...parseParentIdInMongo(parentId),
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
