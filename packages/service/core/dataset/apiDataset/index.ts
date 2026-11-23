import { useApiDatasetRequest } from './custom/api';
import { useYuqueDatasetRequest } from './yuqueDataset/api';
import { useFeishuDatasetRequest } from './feishuDataset/api';
import { useDingtalkDatasetRequest } from './dingtalkDataset/api';
import type { ApiDatasetServerType } from '@fastgpt/global/core/dataset/apiDataset/type';
import type { AsyncCache } from '../../../common/cache/type';
import { resolveApiDatasetProvider, type ResolvedApiDatasetProvider } from './utils';

export { resolveApiDatasetProvider, type ResolvedApiDatasetProvider };

/** 浏览入口可注入短期快照缓存；导入和同步不传缓存，保持本轮远端数据新鲜。 */
export const getApiDatasetRequest = async (
  apiDatasetServer?: ApiDatasetServerType,
  options: { cache?: AsyncCache } = {}
) => {
  const provider = resolveApiDatasetProvider(apiDatasetServer);
  if (!provider) {
    return Promise.reject('Can not find api dataset server');
  }

  switch (provider.type) {
    case 'api':
      return useApiDatasetRequest({ apiServer: provider.server });
    case 'yuque':
      return useYuqueDatasetRequest({ yuqueServer: provider.server, cache: options.cache });
    case 'feishu':
      return useFeishuDatasetRequest({ feishuServer: provider.server });
    case 'dingtalk':
      return useDingtalkDatasetRequest({ dingtalkServer: provider.server });
  }
};
