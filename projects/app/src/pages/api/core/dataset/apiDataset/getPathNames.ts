import { NextAPI } from '@/service/middleware/entry';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import type { ApiDatasetDetailResponse } from '@fastgpt/global/core/dataset/apiDataset/type';
import { getApiDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  GetApiDatasetPathNamesBodySchema,
  GetApiDatasetPathNamesResponseSchema,
  type GetApiDatasetPathNamesBody,
  type GetApiDatasetPathNamesResponse
} from '@fastgpt/global/openapi/core/dataset/apiDataset/api';

const getFullPath = async (
  currentId: string,
  getFileDetail: ({ apiFileId }: { apiFileId: string }) => Promise<ApiDatasetDetailResponse>
): Promise<string> => {
  const response = await getFileDetail({ apiFileId: currentId });

  if (!response) {
    return '';
  }

  if (response.parentId && response.parentId !== null) {
    const parentPath = await getFullPath(response.parentId, getFileDetail);
    return `${parentPath}/${response.name}`;
  }

  return `/${response.name}`;
};

async function handler(
  req: ApiRequestProps<GetApiDatasetPathNamesBody>
): Promise<GetApiDatasetPathNamesResponse> {
  const {
    datasetId,
    parentId,
    apiDatasetServer: bodyApiDatasetServer
  } = GetApiDatasetPathNamesBodySchema.parse(req.body);

  if (!parentId) return GetApiDatasetPathNamesResponseSchema.parse('');

  const apiDatasetServer = await (async () => {
    if (datasetId) {
      const { dataset } = await authDataset({
        req,
        authToken: true,
        authApiKey: true,
        per: ManagePermissionVal,
        datasetId
      });

      return dataset.apiDatasetServer;
    } else {
      await authCert({ req, authToken: true });

      return bodyApiDatasetServer;
    }
  })();

  const apiDataset = await getApiDatasetRequest(apiDatasetServer);

  if (!apiDataset?.getFileDetail) {
    return Promise.reject(DatasetErrEnum.noApiServer);
  }

  const fullPath = await getFullPath(parentId, apiDataset.getFileDetail);

  return GetApiDatasetPathNamesResponseSchema.parse(fullPath);
}

export default NextAPI(handler);
