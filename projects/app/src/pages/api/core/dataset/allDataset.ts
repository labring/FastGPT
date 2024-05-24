import type { NextApiRequest, NextApiResponse } from 'next';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { getVectorModel } from '@fastgpt/service/core/ai/model';
import type { DatasetSimpleItemType } from '@fastgpt/global/core/dataset/type.d';
import { mongoRPermission } from '@fastgpt/global/support/permission/utils';
import { authUserRole } from '@fastgpt/service/support/permission/auth/user';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { NextAPI } from '@/service/middleware/entry';

/* get all dataset by teamId or tmbId */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<any>
): Promise<DatasetSimpleItemType[]> {
  // 凭证校验
  const { teamId, tmbId, teamOwner, role } = await authUserRole({ req, authToken: true });

  const datasets = await MongoDataset.find({
    ...mongoRPermission({ teamId, tmbId, role }),
    type: { $ne: DatasetTypeEnum.folder }
  }).lean();

  return datasets.map((item) => ({
    _id: item._id,
    avatar: item.avatar,
    name: item.name,
    vectorModel: getVectorModel(item.vectorModel)
  }));
}

export default NextAPI(handler);
