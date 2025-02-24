import { GET } from '@/web/common/api/request';
export const getWorkorderURL = () =>
  GET<{
    redirectUrl: string;
  }>('/proApi/common/workorder/create');
