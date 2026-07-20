import type { GetSystemInitDataResponse } from '@fastgpt/global/openapi/common/system/api';
import { GET, POST } from '@/web/common/api/request';
import type { SystemModelItemType } from '@fastgpt/global/core/ai/model/type';

export const getSystemInitData = (bufferId?: string) =>
  GET<GetSystemInitDataResponse>('/common/system/getInitData', {
    bufferId
  });

export type GetMyModelsResponse = {
  list: SystemModelItemType[];
  total?: number;
};

/** 获取当前用户可访问的模型（list 分页响应，前端取其 list 数组；POST + body） */
export const getMyModels = () =>
  POST<GetMyModelsResponse>(
    '/core/ai/model/list',
    { pageSize: 1000, isActive: 'active' },
    { deduplicate: true }
  );

/* 活动 banner */
export const getOperationalAd = () =>
  GET<{ id: string; operationalAdImage: string; operationalAdLink: string }>(
    '/proApi/support/user/inform/getOperationalAd'
  );

export const getActivityAd = () =>
  GET<{ id: string; activityAdImage: string; activityAdLink: string }>(
    '/proApi/support/user/inform/getActivityAd'
  );
