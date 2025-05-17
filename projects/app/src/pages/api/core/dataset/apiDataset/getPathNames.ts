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
import { useApiDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset/api';

export type GetApiDatasetPathQuery = {};

export type GetApiDatasetPathBody = {
  datasetId?: string;
  parentId?: ParentIdType;
  yuqueServer?: YuqueServer;
  feishuServer?: FeishuServer;
  apiServer?: APIFileServer;
};

export type GetApiDatasetPathResponse = string;

type FileDetailGetter = (fileId: string) => Promise<{
  id: string;
  name: string;
  parentId: ParentIdType;
}>;

const getFullPath = async (currentId: string, getFileDetail: FileDetailGetter): Promise<string> => {
  const response = await getFileDetail(currentId);

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

  if (feishuServer) {
    return '';
  }

  if (apiServer) {
    const apiFileGetter: FileDetailGetter = async (fileId) => {
      return await useApiDatasetRequest({ apiServer }).getFileDetail({
        apiFileId: fileId
      });
    };
    return await getFullPath(parentId, apiFileGetter);
  }

  if (yuqueServer) {
    const yuqueFileGetter: FileDetailGetter = async (fileId) => {
      return await getProApiDatasetFileDetailRequest({
        yuqueServer,
        apiFileId: fileId
      });
    };
    return await getFullPath(parentId, yuqueFileGetter);
  }

  return Promise.reject(new Error(DatasetErrEnum.noApiServer));
}

export default NextAPI(handler);
