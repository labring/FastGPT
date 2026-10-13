import { GET, POST } from '@/web/admin/common/request';
import type {
  SendSystemInformBodyType,
  UpdateSystemModalBodyType,
  UpdateOperationalAdBodyType,
  UpdateActivityAdBodyType,
  SystemMsgModalValueType,
  OperationalAdResponseType,
  ActivityAdResponseType
} from '@fastgpt/global/openapi/admin/system/inform/api';

export const postSendSystemMsg = (data: SendSystemInformBodyType) =>
  POST('/proApi/admin/system/inform/sendSystemInform', data);

// 系统公告
export const getSystemMsgModal = () =>
  GET<SystemMsgModalValueType>('/proApi/support/user/inform/getSystemMsgModal');
export const postUpdateSystemMsgModal = (data: UpdateSystemModalBodyType) =>
  POST('/proApi/admin/system/inform/updateSystemModal', data);

// 全屏广告
export const postUpdateOperationalAd = (data: UpdateOperationalAdBodyType) =>
  POST('/proApi/admin/system/inform/updateOperationalAd', data);
export const getOperationalAd = () =>
  GET<OperationalAdResponseType>('/proApi/support/user/inform/getOperationalAd');

// 底部广告
export const postUpdateActivityAd = (data: UpdateActivityAdBodyType) =>
  POST('/proApi/admin/system/inform/updateActivityAd', data);
export const getActivityAd = () =>
  GET<ActivityAdResponseType>('/proApi/support/user/inform/getActivityAd');
