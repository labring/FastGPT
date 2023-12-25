import { GET, POST, PUT, DELETE } from '@/web/common/api/request';
import { UrlFetchParams, UrlFetchResponse } from '@fastgpt/global/common/file/api.d';

export const postFetchUrls = (data: UrlFetchParams) =>
  POST<UrlFetchResponse>(`/common/tools/urlFetch`, data, {
    timeout: 300000
  });
