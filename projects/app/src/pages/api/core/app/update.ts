import type { NextApiRequest, NextApiResponse } from 'next';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import type { AppUpdateParams } from '@/global/core/app/api';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { beforeUpdateAppFormat } from '@fastgpt/service/core/app/controller';
import { NextAPI } from '@/service/middleware/entry';
import {
  ManagePermissionVal,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';

/* 获取我的模型 */
async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  const {
    parentId,
    name,
    avatar,
    type,
    intro,
    nodes,
    edges,
    chatConfig,
    teamTags,
    defaultPermission
  } = req.body as AppUpdateParams;
  const { appId } = req.query as { appId: string };

  if (!appId) {
    throw new Error('appId is empty');
  }

  // 凭证校验
  if (defaultPermission) {
    await authApp({ req, authToken: true, appId, per: ManagePermissionVal });
  } else {
    await authApp({ req, authToken: true, appId, per: WritePermissionVal });
  }

  // format nodes data
  // 1. dataset search limit, less than model quoteMaxToken
  const { nodes: formatNodes } = beforeUpdateAppFormat({ nodes });

  // 更新模型
  await MongoApp.findByIdAndUpdate(appId, {
    ...parseParentIdInMongo(parentId),
    ...(name && { name }),
    ...(type && { type }),
    ...(avatar && { avatar }),
    ...(intro !== undefined && { intro }),
    ...(defaultPermission !== undefined && { defaultPermission }),
    ...(teamTags && { teamTags }),
    ...(formatNodes && {
      modules: formatNodes
    }),
    ...(edges && {
      edges
    }),
    ...(chatConfig && { chatConfig })
  });
}

export default NextAPI(handler);
