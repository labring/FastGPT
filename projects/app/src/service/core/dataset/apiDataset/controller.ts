import { GetApiDatasetFileListResponse } from '@/pages/api/core/dataset/apiDataset/list';
import { FeishuServer, YuqueServer } from '@fastgpt/global/core/dataset/apiDataset';
import { POST } from '@fastgpt/service/common/api/plusRequest';

export const getFeishuAndYuqueDatasetFileList = async (data: {
  feishuServer?: FeishuServer;
  yuqueServer?: YuqueServer;
  parentId?: string;
}) => {
  const res = await POST<GetApiDatasetFileListResponse>('/core/dataset/systemApiDataset', {
    type: 'list',
    ...data
  });
  return res;
};
