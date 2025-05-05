import { NextAPI } from '@/service/middleware/entry';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import type {
  APIFileServer,
  YuqueServer,
  FeishuServer
} from '@fastgpt/global/core/dataset/apiDataset';
import { getProApiDatasetFileDetailRequest } from '@/service/core/dataset/apiDataset/controller';
import { useApiDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset/api';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';

export type GetApiDatasetPathQuery = {};

export type GetApiDatasetPathBody = {
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
  const { parentId, yuqueServer, feishuServer, apiServer } = req.body;

  try {
    await authCert({ req, authToken: true });

    if (!apiServer && !feishuServer && !yuqueServer) {
      return Promise.reject(new Error(DatasetErrEnum.noApiServer));
    }

    if (apiServer) {
      if (!parentId) return '';

      const getApiFullPath = async (currentId: string): Promise<string> => {
        const fileList = await useApiDatasetRequest({ apiServer }).listFiles({
          parentId: currentId
        });

        const currentFile = fileList.find((file) => file.id === currentId);
        if (!currentFile) return '';

        if (currentFile.parentId) {
          const parentPath = await getApiFullPath(currentFile.parentId);
          return `${parentPath}${parentPath.endsWith('/') ? '' : '/'}${currentFile.name}`;
        }

        return `/${currentFile.name}`;
      };

      return await getApiFullPath(parentId);
    }

    if (feishuServer || yuqueServer) {
      const getFullPath = async (currentId?: string): Promise<string> => {
        if (!currentId) return '';

        const response = await getProApiDatasetFileDetailRequest({
          feishuServer,
          yuqueServer,
          apiFileId: currentId
        });

        if (response.parentId) {
          const parentPath = await getFullPath(response.parentId);
          return `${parentPath}${parentPath.endsWith('/') ? '' : '/'}${response.name}`;
        }

        return `/${response.name}`;
      };

      return await getFullPath(parentId === null ? undefined : parentId);
    }

    return Promise.reject(new Error(DatasetErrEnum.noApiServer));
  } catch (err) {
    return Promise.reject(err);
  }
}

export default NextAPI(handler);
