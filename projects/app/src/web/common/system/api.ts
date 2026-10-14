import { GET } from '@/web/common/api/request';
import type { GetSystemInitDataResponse } from '@fastgpt/global/openapi/common/system/api';
export const getSystemInitData = (bufferId?: string, pathname?: string) =>
  GET<GetSystemInitDataResponse>('/common/system/getInitData', {
    bufferId,
    ...(pathname !== undefined && { pathname })
  });

/* 活动 banner */
export const getOperationalAd = () =>
  GET<{ id: string; operationalAdImage: string; operationalAdLink: string }>(
    '/proApi/support/user/inform/getOperationalAd'
  );

export const getActivityAd = () =>
  GET<{ id: string; activityAdImage: string; activityAdLink: string }>(
    '/proApi/support/user/inform/getActivityAd'
  );
