import { GET, POST, PUT, DELETE } from './request';

import type { FetchResultItem } from '@/global/common/api/pluginRes.d';

export const postFetchUrls = (urlList: string[]) =>
  POST<FetchResultItem[]>(`/plugins/urlFetch`, { urlList });
