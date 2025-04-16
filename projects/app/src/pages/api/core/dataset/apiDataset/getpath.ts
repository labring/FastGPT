import { getProApiDatasetFileDetailRequest } from '@/service/core/dataset/apiDataset/controller';
import { NextAPI } from '@/service/middleware/entry';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { APIFileServer } from '@fastgpt/global/core/dataset/apiDataset';
import { useApiDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset/api';
import { NextApiRequest } from 'next';
import { YuqueServer, FeishuServer } from '@fastgpt/global/core/dataset/apiDataset';
import { authCert } from '@fastgpt/service/support/permission/auth/common';

export type GetApiDatasetFilePathProps = {
  parentId?: ParentIdType;
  yuqueServer?: YuqueServer;
  feishuServer?: FeishuServer;
  apiServer?: APIFileServer;
};

export type GetApiDatasetFilePathResponse = string;

async function handler(req: NextApiRequest) {
  const { parentId, yuqueServer, feishuServer, apiServer } = req.body as GetApiDatasetFilePathProps;

  await authCert({ req, authToken: true });

  try {
    // API type path processing
    if (apiServer) {
      if (!parentId) return '';

      // Recursively get the full path of the API type
      const getApiFullPath = async (currentId: string): Promise<string> => {
        try {
          const fileList = await useApiDatasetRequest({ apiServer }).listFiles({
            parentId: currentId
          });
          if (!Array.isArray(fileList)) {
            console.error('文件列表格式错误:', fileList);
            return '';
          }

          const currentFile = fileList.find((file) => file.id === currentId);
          if (!currentFile) return '';

          if (currentFile.parentId) {
            const parentPath = await getApiFullPath(currentFile.parentId);
            return `${parentPath}${parentPath.endsWith('/') ? '' : '/'}${currentFile.name}`;
          }

          return `/${currentFile.name}`;
        } catch (error) {
          console.error('获取 API 文件列表失败:', error);
          return '';
        }
      };

      return await getApiFullPath(parentId);
    }

    // Feishu or Yuque type path processing
    if (feishuServer || yuqueServer) {
      const getFullPath = async (currentId?: string): Promise<string> => {
        if (!currentId) {
          return '';
        }

        try {
          const response = await getProApiDatasetFileDetailRequest({
            feishuServer,
            yuqueServer,
            apiFileId: currentId
          });

          // Check the format of the response data
          if (!response || typeof response !== 'object') {
            console.error('文件详情响应格式错误:', response);
            return '';
          }

          // If there is a parent, continue recursively
          if (response.parentId) {
            const parentPath = await getFullPath(response.parentId);
            return `${parentPath}${parentPath.endsWith('/') ? '' : '/'}${response.name}`;
          }

          // No parent, means it's the root directory
          return `/${response.name}`;
        } catch (error) {
          console.error('获取文件详情失败:', error);
          if (error && typeof error === 'object' && 'message' in error) {
            console.error('错误详情:', error.message);
          }
          return '';
        }
      };

      return await getFullPath(parentId === null ? undefined : parentId);
    }

    throw new Error(DatasetErrEnum.noApiServer);
  } catch (error) {
    console.error('获取路径失败:', error);
    return '';
  }
}

export default NextAPI(handler);
