import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { getQAModel, getVectorModel } from '@/service/core/ai/model';
import type { DatasetItemType } from '@fastgpt/global/core/dataset/type.d';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constant';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { mongoRPermission } from '@fastgpt/global/support/permission/utils';
import { authUserRole } from '@fastgpt/service/support/permission/auth/user';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { parentId, type } = req.query as { parentId?: string; type?: `${DatasetTypeEnum}` };
    // 凭证校验
    const { teamId, tmbId, teamOwner, role, canWrite } = await authUserRole({
      req,
      authToken: true
    });

    const datasets = await MongoDataset.find({
      ...mongoRPermission({ teamId, tmbId, role }),
      ...(parentId !== undefined && { parentId: parentId || null }),
      ...(type && { type })
    })
      .sort({ updateTime: -1 })
      .lean();

    const data = await Promise.all(
      datasets.map(async (item) => ({
        ...item,
        vectorModel: getVectorModel(item.vectorModel),
        agentModel: getQAModel(item.agentModel),
        canWrite,
        isOwner: teamOwner || String(item.tmbId) === tmbId
      }))
    );

    jsonRes<DatasetItemType[]>(res, {
      data
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
