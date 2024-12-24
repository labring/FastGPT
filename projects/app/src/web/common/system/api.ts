import type { InitDateResponse } from '@/global/common/api/systemRes';
import { GET } from '@/web/common/api/request';

export const getSystemInitData = (bufferId?: string) =>
  GET<InitDateResponse>('/common/system/getInitData', {
    bufferId
  });
