import { GET, POST, PUT, DELETE } from '@/web/common/api/request';

import type { FetchResultItem } from '@/global/common/api/pluginRes.d';

export const postFetchUrls = (urlList: string[]) =>
  POST<FetchResultItem[]>(`/plugins/urlFetch`, { urlList });
