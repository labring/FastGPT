import type {
  APIFileServer,
  YuqueServer,
  FeishuShareServer,
  FeishuKnowledgeServer,
  FeishuPrivateServer
} from '@fastgpt/global/core/dataset/apiDataset';
import { useApiDatasetRequest } from './api';
import { useYuqueDatasetRequest } from './yuqueDataset/api';
import { useFeishuShareDatasetRequest } from './feishuShareDataset/api';
import { useFeishuKnowledgeDatasetRequest } from './feishuKnowledgeDataset/api';
import { useFeishuPrivateDatasetRequest } from './feishuPrivateDataset/api';

export const getApiDatasetRequest = async (data: {
  apiServer?: APIFileServer;
  yuqueServer?: YuqueServer;
  feishuShareServer?: FeishuShareServer;
  feishuKnowledgeServer?: FeishuKnowledgeServer;
  feishuPrivateServer?: FeishuPrivateServer;
}) => {
  const { apiServer, yuqueServer, feishuShareServer, feishuKnowledgeServer, feishuPrivateServer } =
    data;

  if (apiServer) {
    return useApiDatasetRequest({ apiServer });
  }
  if (yuqueServer) {
    return useYuqueDatasetRequest({ yuqueServer });
  }
  if (feishuShareServer) {
    return useFeishuShareDatasetRequest({ feishuShareServer });
  }
  if (feishuKnowledgeServer) {
    return useFeishuKnowledgeDatasetRequest({ feishuKnowledgeServer });
  }
  if (feishuPrivateServer) {
    return useFeishuPrivateDatasetRequest({ feishuPrivateServer });
  }
  return Promise.reject('Can not find api dataset server');
};
