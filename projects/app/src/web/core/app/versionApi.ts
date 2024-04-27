import { PostPublishAppProps } from '@/global/core/app/api';
import { GET, POST, DELETE, PUT } from '@/web/common/api/request';

export const postPublishApp = (appId: string, data: PostPublishAppProps) =>
  POST(`/core/app/version/publish?appId=${appId}`, data);
