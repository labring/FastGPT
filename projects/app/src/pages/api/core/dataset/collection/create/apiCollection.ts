import type { PluginDatasetCreateCollectionParams } from '@fastgpt/global/core/dataset/api.d';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';

import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { getPluginDatasetRequest } from '@fastgpt/service/core/dataset/pluginDataset';
import { createPluginDatasetCollection } from './apiCollectionV2';

async function handler(req: ApiRequestProps<PluginDatasetCreateCollectionParams>) {
  const { apiFileId, ...body } = req.body;

  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: body.datasetId,
    per: WritePermissionVal
  });

  const fileDetail = await (
    await getPluginDatasetRequest(dataset.pluginDatasetServer)
  ).getFileDetail({
    apiFileId
  });

  return createPluginDatasetCollection({
    apiFiles: [fileDetail],
    teamId,
    tmbId,
    dataset,
    ...body
  });
}

export default NextAPI(handler);
