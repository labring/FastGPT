import {
  APIFileListResponse,
  FeishuServer,
  YuqueServer
} from '@fastgpt/global/core/dataset/apiDataset';
import { POST } from '@fastgpt/service/common/api/plusRequest';

export const getFeishuAndYuqueDatasetFileList = async (data: {
  feishuServer?: FeishuServer;
  yuqueServer?: YuqueServer;
  parentId?: string;
  pageSize: number;
  offset: number;
  metaData?: Record<string, any>;
}) => {
  const res = await POST<APIFileListResponse>('/core/dataset/systemApiDataset', {
    type: 'list',
    ...data
  });
  return res;
};
