import { useApiDatasetRequest } from './custom/api';
import { useYuqueDatasetRequest } from './yuqueDataset/api';
import { useFeishuDatasetRequest } from './feishuDataset/api';
import { useDingtalkDatasetRequest } from './dingtalkDataset/api';
import type { ApiDatasetServerType } from '@fastgpt/global/core/dataset/apiDataset/type';

export const getApiDatasetRequest = async (apiDatasetServer?: ApiDatasetServerType) => {
  const { apiServer, yuqueServer, feishuServer, dingtalkServer } = apiDatasetServer || {};

  if (apiServer) {
    return useApiDatasetRequest({ apiServer });
  }
  if (yuqueServer) {
    return useYuqueDatasetRequest({ yuqueServer });
  }
  if (feishuServer) {
    return useFeishuDatasetRequest({ feishuServer });
  }
  if (dingtalkServer) {
    return useDingtalkDatasetRequest({ dingtalkServer });
  }
  return Promise.reject('Can not find api dataset server');
};
