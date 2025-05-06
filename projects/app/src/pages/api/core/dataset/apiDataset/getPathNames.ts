import { NextAPI } from '@/service/middleware/entry';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import type {
  APIFileServer,
  YuqueServer,
  FeishuServer
} from '@fastgpt/global/core/dataset/apiDataset';
import { getProApiDatasetFileDetailRequest } from '@/service/core/dataset/apiDataset/controller';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';

export type GetApiDatasetPathQuery = {};

export type GetApiDatasetPathBody = {
  datasetId?: string;
  parentId?: ParentIdType;
  yuqueServer?: YuqueServer;
  feishuServer?: FeishuServer;
  apiServer?: APIFileServer;
};

export type GetApiDatasetPathResponse = string;

async function handler(
  req: ApiRequestProps<GetApiDatasetPathBody, any>,
  res: ApiResponseType<GetApiDatasetPathResponse>
): Promise<GetApiDatasetPathResponse> {
  const { datasetId, parentId } = req.body;
  if (!parentId) return '';

  const { yuqueServer, feishuServer, apiServer } = await (async () => {
    if (datasetId) {
      const { dataset } = await authDataset({
        req,
        authToken: true,
        authApiKey: true,
        per: ManagePermissionVal,
        datasetId
      });

      return {
        yuqueServer: req.body.yuqueServer
          ? { ...req.body.yuqueServer, token: dataset.yuqueServer?.token ?? '' }
          : dataset.yuqueServer,
        feishuServer: req.body.feishuServer
          ? { ...req.body.feishuServer, appSecret: dataset.feishuServer?.appSecret ?? '' }
          : dataset.feishuServer,
        apiServer: req.body.apiServer
          ? {
              ...req.body.apiServer,
              authorization: dataset.apiServer?.authorization ?? ''
            }
          : dataset.apiServer
      };
    } else {
      await authCert({ req, authToken: true });

      return {
        yuqueServer: req.body.yuqueServer,
        feishuServer: req.body.feishuServer,
        apiServer: req.body.apiServer
      };
    }
  })();

  if (!apiServer && !feishuServer && !yuqueServer) {
    return Promise.reject(DatasetErrEnum.noApiServer);
  }

  if (apiServer || feishuServer) {
    return Promise.reject('不支持获取 BaseUrl');
  }

  if (yuqueServer) {
    const getFullPath = async (currentId: string): Promise<string> => {
      const response = await getProApiDatasetFileDetailRequest({
        feishuServer,
        yuqueServer,
        apiFileId: currentId
      });

      if (response.parentId) {
        const parentPath = await getFullPath(response.parentId);
        return `${parentPath}/${response.name}`;
      }

      return `/${response.name}`;
    };

    return await getFullPath(parentId);
  }

  return Promise.reject(new Error(DatasetErrEnum.noApiServer));
}

export default NextAPI(handler);
