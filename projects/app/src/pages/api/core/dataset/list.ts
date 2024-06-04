import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import type { DatasetListItemType } from '@fastgpt/global/core/dataset/type.d';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { mongoRPermission } from '@fastgpt/global/support/permission/utils';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { getVectorModel } from '@fastgpt/service/core/ai/model';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  const { parentId, type } = req.query as { parentId?: string; type?: DatasetTypeEnum };
  // 凭证校验
  const { teamId, tmbId, permission } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: ReadPermissionVal
  });

  const datasets = await MongoDataset.find({
    ...mongoRPermission({ teamId, tmbId, permission }),
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
      canWrite: permission.hasWritePer,
      isOwner: permission.isOwner || String(item.tmbId) === tmbId,
      vectorModel: getVectorModel(item.vectorModel)
    }))
  );

  jsonRes<DatasetListItemType[]>(res, {
    data
  });
}

export default NextAPI(handler);
