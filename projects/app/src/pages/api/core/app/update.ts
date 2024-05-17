import type { NextApiRequest, NextApiResponse } from 'next';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import type { AppUpdateParams } from '@/global/core/app/api';
import { authApp } from '@fastgpt/service/support/permission/auth/app';
import { beforeUpdateAppFormat } from '@fastgpt/service/core/app/controller';
import { NextAPI } from '@/service/middleware/entry';

/* 获取我的模型 */
async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  const { name, avatar, type, intro, nodes, edges, permission, teamTags } =
    req.body as AppUpdateParams;
  const { appId } = req.query as { appId: string };

  if (!appId) {
    throw new Error('appId is empty');
  }

  // 凭证校验
  await authApp({ req, authToken: true, appId, per: permission ? 'owner' : 'w' });

  // format nodes data
  // 1. dataset search limit, less than model quoteMaxToken
  const { nodes: formatNodes } = beforeUpdateAppFormat({ nodes });

  // 更新模型
  await MongoApp.updateOne(
    {
      _id: appId
    },
    {
      name,
      type,
      avatar,
      intro,
      permission,
      ...(teamTags && teamTags),
      ...(formatNodes && {
        modules: formatNodes
      }),
      ...(edges && {
        edges
      })
    }
  );
}

export default NextAPI(handler);
