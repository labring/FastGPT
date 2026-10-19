import { useApiDatasetRequest } from './custom/api';
import { useYuqueDatasetRequest } from './yuqueDataset/api';
import { useFeishuDatasetRequest } from './feishuDataset/api';
import { useDingtalkDatasetRequest } from './dingtalkDataset/api';
import type { ApiDatasetServerType } from '@fastgpt/global/core/dataset/apiDataset/type';
import type { AsyncCache } from '../../../common/cache/type';

/** 浏览入口可注入短期快照缓存；导入和同步不传缓存，保持本轮远端数据新鲜。 */
export const getApiDatasetRequest = async (
  apiDatasetServer?: ApiDatasetServerType,
  options: { cache?: AsyncCache } = {}
) => {
  const { apiServer, yuqueServer, feishuServer, dingtalkServer } = apiDatasetServer || {};

  if (apiServer) {
    return useApiDatasetRequest({ apiServer });
  }
  if (yuqueServer) {
    return useYuqueDatasetRequest({ yuqueServer, cache: options.cache });
  }
  if (feishuServer) {
    return useFeishuDatasetRequest({ feishuServer });
  }
  if (dingtalkServer) {
    return useDingtalkDatasetRequest({ dingtalkServer });
  }
  return Promise.reject('Can not find api dataset server');
};
