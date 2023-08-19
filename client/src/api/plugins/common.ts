import { GET, POST, PUT, DELETE } from '../request';

import type { FetchResultItem } from '@/types/plugin';

export const fetchUrls = (urlList: string[]) =>
  POST<FetchResultItem[]>(`/plugins/urlFetch`, { urlList });
