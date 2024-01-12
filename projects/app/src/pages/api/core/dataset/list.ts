import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import type { DatasetListItemType } from '@fastgpt/global/core/dataset/type.d';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constant';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { mongoRPermission } from '@fastgpt/global/support/permission/utils';
import { authUserRole } from '@fastgpt/service/support/permission/auth/user';
import { getVectorModel } from '@/service/core/ai/model';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { parentId, type } = req.query as { parentId?: string; type?: `${DatasetTypeEnum}` };
    // 凭证校验
    const { teamId, tmbId, teamOwner, role, canWrite } = await authUserRole({
      req,
      authToken: true,
      authApiKey: true
    });

    const datasets = await MongoDataset.find({
      ...mongoRPermission({ teamId, tmbId, role }),
      ...(parentId !== undefined && { parentId: parentId || null }),
      ...(type && { type })
    })
      .sort({ updateTime: -1 })
      .lean();

    const data = await Promise.all(
      datasets.map<DatasetListItemType>((item) => ({
        _id: item._id,
        parentId: item.parentId,
        avatar: item.avatar,
        name: item.name,
        intro: item.intro,
        type: item.type,
        permission: item.permission,
        canWrite,
        isOwner: teamOwner || String(item.tmbId) === tmbId,
        vectorModel: getVectorModel(item.vectorModel)
      }))
    );

    jsonRes<DatasetListItemType[]>(res, {
      data
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
