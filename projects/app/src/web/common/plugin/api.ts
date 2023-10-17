import { GET, POST, PUT, DELETE } from '@/web/common/api/request';

import type { FetchResultItem } from '@fastgpt/global/common/plugin/types/pluginRes.d';

export const postFetchUrls = (urlList: string[]) =>
  POST<FetchResultItem[]>(`/plugins/urlFetch`, { urlList });
