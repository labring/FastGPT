import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoPlugin } from '@fastgpt/service/core/plugin/schema';
import { PluginListItemType } from '@fastgpt/global/core/plugin/controller';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { parentId, type } = req.query as { parentId?: string; type?: `${DatasetTypeEnum}` };

    const { teamId } = await authCert({ req, authToken: true });

    const plugins = await MongoPlugin.find(
      {
        teamId,
        ...(parentId !== undefined && { parentId: parentId || null }),
        ...(type && { type })
      },
      '_id parentId type name avatar intro metadata'
    )
      .sort({ updateTime: -1 })
      .lean();

    jsonRes<PluginListItemType[]>(res, {
      data: plugins
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
