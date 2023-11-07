import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { getVectorModel } from '@/service/core/ai/model';
import type { DatasetItemType } from '@/types/core/dataset';
import { mongoRPermission } from '@fastgpt/global/support/permission/utils';
import { authUserRole } from '@fastgpt/service/support/permission/auth/user';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    // 凭证校验
    const { teamId, tmbId, teamOwner, role } = await authUserRole({ req, authToken: true });

    const datasets = await MongoDataset.find({
      ...mongoRPermission({ teamId, tmbId, role }),
      type: 'dataset'
    });

    const data = datasets.map((item) => ({
      ...item.toJSON(),
      tags: item.tags.join(' '),
      vectorModel: getVectorModel(item.vectorModel),
      canWrite: String(item.tmbId) === tmbId,
      isOwner: teamOwner || String(item.tmbId) === tmbId
    }));

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
