import { NextAPI } from '@/service/middleware/entry';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { APIFileServer, YuqueServer, FeishuServer } from '@fastgpt/global/core/dataset/apiDataset';
import { getProApiDatasetFileDetailRequest } from '@/service/core/dataset/apiDataset/controller';
import { useApiDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset/api';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';

export type GetPathQuery = {};

export type GetPathBody = {
  parentId?: ParentIdType;
  yuqueServer?: YuqueServer;
  feishuServer?: FeishuServer;
  apiServer?: APIFileServer;
};

export type GetPathResponse = string;

async function handler(
  req: ApiRequestProps<GetPathBody, any>,
  res: ApiResponseType<GetPathResponse>
): Promise<GetPathResponse> {
  const { parentId, yuqueServer, feishuServer, apiServer } = req.body;

  try {
    await authCert({ req, authToken: true });

    // 验证服务器配置
    if (!apiServer && !feishuServer && !yuqueServer) {
      return Promise.reject(new Error(DatasetErrEnum.noApiServer));
    }

    // API 类型文件路径处理
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

    // 飞书/语雀 文件路径处理
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
