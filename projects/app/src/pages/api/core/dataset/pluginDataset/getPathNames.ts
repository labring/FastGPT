import { NextAPI } from '@/service/middleware/entry';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import type { PluginDatasetDetailResponse } from '@fastgpt/global/core/dataset/pluginDataset/type';
import { getPluginDatasetRequest } from '@fastgpt/service/core/dataset/pluginDataset';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import type {
  GetPathNamesBodyType,
  GetPathNamesResponseType
} from '@fastgpt/global/openapi/core/dataset/pluginDataset/api';

const getFullPath = async (
  currentId: string,
  getFileDetail: ({ apiFileId }: { apiFileId: string }) => Promise<PluginDatasetDetailResponse>
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
  req: ApiRequestProps<GetPathNamesBodyType>,
  _res: ApiResponseType<GetPathNamesResponseType>
): Promise<GetPathNamesResponseType> {
  const { datasetId, parentId, pluginDatasetServer } = req.body;
  if (!parentId) return '';

  const serverConfig = await (async () => {
    if (datasetId) {
      const { dataset } = await authDataset({
        req,
        authToken: true,
        authApiKey: true,
        per: ManagePermissionVal,
        datasetId
      });

      return dataset.pluginDatasetServer;
    } else {
      await authCert({ req, authToken: true });

      return pluginDatasetServer;
    }
  })();

  const pluginDataset = await getPluginDatasetRequest(serverConfig);

  if (!pluginDataset?.getFileDetail) {
    return Promise.reject(DatasetErrEnum.noApiServer);
  }

  return await getFullPath(parentId, pluginDataset.getFileDetail);
}

export default NextAPI(handler);
