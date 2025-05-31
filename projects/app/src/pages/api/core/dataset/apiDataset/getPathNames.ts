import { NextAPI } from '@/service/middleware/entry';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import type {
  APIFileServer,
  YuqueServer,
  FeishuShareServer,
  ApiDatasetDetailResponse,
  FeishuKnowledgeServer,
  FeishuPrivateServer
} from '@fastgpt/global/core/dataset/apiDataset';
import { getApiDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';

export type GetApiDatasetPathQuery = {};

export type GetApiDatasetPathBody = {
  datasetId?: string;
  parentId?: ParentIdType;
  yuqueServer?: YuqueServer;
  feishuShareServer?: FeishuShareServer;
  apiServer?: APIFileServer;
  feishuKnowledgeServer?: FeishuKnowledgeServer;
  feishuPrivateServer?: FeishuPrivateServer;
};

export type GetApiDatasetPathResponse = string;

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
  req: ApiRequestProps<GetApiDatasetPathBody, any>,
  res: ApiResponseType<GetApiDatasetPathResponse>
): Promise<GetApiDatasetPathResponse> {
  const { datasetId, parentId } = req.body;
  if (!parentId) return '';

  const { yuqueServer, feishuShareServer, apiServer, feishuKnowledgeServer, feishuPrivateServer } =
    await (async () => {
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
          feishuShareServer: req.body.feishuShareServer
            ? {
                ...req.body.feishuShareServer,
                user_access_token: dataset.feishuShareServer?.user_access_token ?? ''
              }
            : dataset.feishuShareServer,
          apiServer: req.body.apiServer
            ? {
                ...req.body.apiServer,
                authorization: dataset.apiServer?.authorization ?? ''
              }
            : dataset.apiServer,
          feishuKnowledgeServer: req.body.feishuKnowledgeServer
            ? {
                ...req.body.feishuKnowledgeServer,
                user_access_token: dataset.feishuKnowledgeServer?.user_access_token ?? ''
              }
            : dataset.feishuKnowledgeServer,
          feishuPrivateServer: req.body.feishuPrivateServer
            ? {
                ...req.body.feishuPrivateServer,
                user_access_token: dataset.feishuPrivateServer?.user_access_token ?? ''
              }
            : dataset.feishuPrivateServer
        };
      } else {
        await authCert({ req, authToken: true });

        return {
          yuqueServer: req.body.yuqueServer,
          feishuShareServer: req.body.feishuShareServer,
          apiServer: req.body.apiServer,
          feishuKnowledgeServer: req.body.feishuKnowledgeServer,
          feishuPrivateServer: req.body.feishuPrivateServer
        };
      }
    })();

  if (feishuShareServer) {
    return '';
  }

  if (yuqueServer || apiServer || feishuKnowledgeServer || feishuPrivateServer) {
    const apiDataset = await getApiDatasetRequest({
      yuqueServer,
      apiServer,
      feishuKnowledgeServer,
      feishuPrivateServer
    });

    if (!apiDataset?.getFileDetail) {
      return Promise.reject(DatasetErrEnum.noApiServer);
    }

    return await getFullPath(parentId, apiDataset.getFileDetail);
  }

  return Promise.reject(new Error(DatasetErrEnum.noApiServer));
}

export default NextAPI(handler);
