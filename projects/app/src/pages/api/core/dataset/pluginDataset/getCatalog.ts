import { getPluginDatasetRequest } from '@fastgpt/service/core/dataset/pluginDataset';
import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import {
  GetCatalogBodySchema,
  type GetCatalogResponseType
} from '@fastgpt/global/openapi/core/dataset/pluginDataset/api';
import type { PluginFileItemType } from '@fastgpt/global/core/dataset/pluginDataset/type';

async function handler(
  req: ApiRequestProps,
  _res: ApiResponseType<GetCatalogResponseType>
): Promise<GetCatalogResponseType> {
  const {
    searchKey = '',
    parentId = null,
    pluginDatasetServer
  } = GetCatalogBodySchema.parse(req.body);

  await authCert({ req, authToken: true });

  const data = await (
    await getPluginDatasetRequest(pluginDatasetServer)
  ).listFiles({ parentId, searchKey });

  return data?.filter((item: PluginFileItemType) => item.hasChild === true) || [];
}

export default NextAPI(handler);
