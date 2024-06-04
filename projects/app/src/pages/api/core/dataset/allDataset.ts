import type { NextApiRequest, NextApiResponse } from 'next';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { getVectorModel } from '@fastgpt/service/core/ai/model';
import type { DatasetSimpleItemType } from '@fastgpt/global/core/dataset/type.d';
import { mongoRPermission } from '@fastgpt/global/support/permission/utils';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';

/* get all dataset by teamId or tmbId */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<any>
): Promise<DatasetSimpleItemType[]> {
  // 凭证校验
  const { teamId, tmbId, permission } = await authUserPer({
    req,
    authToken: true,
    per: ReadPermissionVal
  });

  const datasets = await MongoDataset.find({
    ...mongoRPermission({ teamId, tmbId, permission }),
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
