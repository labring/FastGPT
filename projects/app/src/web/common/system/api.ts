import { GET } from '@/web/common/api/request';
import type {
  GetSystemInitDataQuery,
  GetSystemInitDataResponse
} from '@fastgpt/global/openapi/common/system/api';
/** 按调用方所需资源获取公开初始化数据，套餐请求不依赖浏览器路径或 Referer。 */
export const getSystemInitData = (query: GetSystemInitDataQuery = {}) =>
  GET<GetSystemInitDataResponse>('/common/system/getInitData', query);

/* 活动 banner */
export const getOperationalAd = () =>
  GET<{ id: string; operationalAdImage: string; operationalAdLink: string }>(
    '/proApi/support/user/inform/getOperationalAd'
  );

export const getActivityAd = () =>
  GET<{ id: string; activityAdImage: string; activityAdLink: string }>(
    '/proApi/support/user/inform/getActivityAd'
  );
