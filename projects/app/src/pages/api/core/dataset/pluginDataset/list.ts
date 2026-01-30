import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { getPluginDatasetRequest } from '@fastgpt/service/core/dataset/pluginDataset';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import type {
  ListPluginDatasetFilesBodyType,
  ListPluginDatasetFilesResponseType
} from '@fastgpt/global/openapi/core/dataset/pluginDataset/api';

async function handler(
  req: ApiRequestProps<ListPluginDatasetFilesBodyType>,
  _res: ApiResponseType<ListPluginDatasetFilesResponseType>
): Promise<ListPluginDatasetFilesResponseType> {
  const { searchKey = '', parentId = null, datasetId } = req.body;

  const { dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: ReadPermissionVal
  });

  return (await getPluginDatasetRequest(dataset.pluginDatasetServer)).listFiles({
    searchKey,
    parentId
  });
}

export default NextAPI(handler);
