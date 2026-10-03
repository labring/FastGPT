import { GET, POST } from '@/web/common/api/request';
import type { GetSystemInitDataResponse } from '@fastgpt/global/openapi/common/system/api';
import type {
  GetModelSummariesBody,
  GetModelSummariesResponse
} from '@fastgpt/global/openapi/core/ai/model/summary';

/** 批量详情接口；选择器调用时只提交当前一个模型 ID。 */
export const getUserModelSummaries = (body: GetModelSummariesBody) =>
  POST<GetModelSummariesResponse>('/core/ai/model/summary', body);

export const getSystemInitData = (bufferId?: string) =>
  GET<GetSystemInitDataResponse>('/common/system/getInitData', {
    bufferId
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
