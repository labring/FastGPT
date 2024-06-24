import type { NextApiRequest } from 'next';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import type { DatasetUpdateBody } from '@fastgpt/global/core/dataset/api.d';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import {
  OwnerPermissionVal,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

async function handler(req: NextApiRequest) {
  const {
    id,
    parentId,
    name,
    avatar,
    intro,
    agentModel,
    websiteConfig,
    externalReadUrl,
    defaultPermission,
    status
  } = req.body as DatasetUpdateBody;

  if (!id) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  if (defaultPermission) {
    await authDataset({ req, authToken: true, datasetId: id, per: OwnerPermissionVal });
  } else {
    await authDataset({ req, authToken: true, datasetId: id, per: WritePermissionVal });
  }

  console.log('update dataset', req.body);

  await MongoDataset.findOneAndUpdate(
    {
      _id: id
    },
    {
      ...(parentId !== undefined && { parentId: parentId || null }),
      ...(name && { name }),
      ...(avatar && { avatar }),
      ...(agentModel && { agentModel: agentModel.model }),
      ...(websiteConfig && { websiteConfig }),
      ...(status && { status }),
      ...(intro && { intro }),
      ...(externalReadUrl && { externalReadUrl }),
      ...(defaultPermission !== undefined && { defaultPermission })
    }
  );
}

export default NextAPI(handler);
