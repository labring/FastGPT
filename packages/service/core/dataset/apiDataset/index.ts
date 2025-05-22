import type {
  APIFileServer,
  YuqueServer,
  FeishuServer
} from '@fastgpt/global/core/dataset/apiDataset';
import { useApiDatasetRequest } from './api';
import { useYuqueDatasetRequest } from '../yuqueDataset/api';
import { useFeishuDatasetRequest } from '../feishuDataset/api';

export const getApiDatasetRequest = async (data: {
  apiServer?: APIFileServer;
  yuqueServer?: YuqueServer;
  feishuServer?: FeishuServer;
}) => {
  const { apiServer, yuqueServer, feishuServer } = data;

  if (apiServer) {
    return useApiDatasetRequest({ apiServer });
  }
  if (yuqueServer) {
    return useYuqueDatasetRequest({ yuqueServer });
  }
  if (feishuServer) {
    return useFeishuDatasetRequest({ feishuServer });
  }
  return Promise.reject('Can not find api dataset server');
};
