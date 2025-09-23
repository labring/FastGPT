import type { InitDateResponse } from '@/pages/api/common/system/getInitData';
import { GET } from '@/web/common/api/request';

export const getSystemInitData = (bufferId?: string) =>
  GET<InitDateResponse>('/common/system/getInitData', {
    bufferId
  });
