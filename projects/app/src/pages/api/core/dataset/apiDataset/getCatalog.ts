import { getApiDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import {
  GetApiDatasetCatalogBodySchema,
  GetApiDatasetCatalogResponseSchema,
  type GetApiDatasetCatalogBody,
  type GetApiDatasetCatalogResponse
} from '@fastgpt/global/openapi/core/dataset/apiDataset/api';

async function handler(
  req: ApiRequestProps<GetApiDatasetCatalogBody>
): Promise<GetApiDatasetCatalogResponse> {
  const {
    parentId,
    searchKey = '',
    apiDatasetServer
  } = GetApiDatasetCatalogBodySchema.parse(req.body);

  await authCert({ req, authToken: true });

  // Remove basePath from apiDatasetServer
  if (apiDatasetServer) {
    Object.values(apiDatasetServer).forEach((server) => {
      if (server && 'basePath' in server && server.basePath) {
        delete server.basePath;
      }
    });
  }

  const data = await (
    await getApiDatasetRequest(apiDatasetServer)
  ).listFiles({ parentId, searchKey: searchKey });

  const folders = data?.filter((item) => item.hasChild === true) ?? [];

  return GetApiDatasetCatalogResponseSchema.parse(folders);
}

export default NextAPI(handler);
