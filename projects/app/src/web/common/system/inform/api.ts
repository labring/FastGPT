import { GET, POST } from '@/web/admin/common/request';
import type {
  SendSystemInformBodyType,
  UpdateSystemModalBodyType,
  UpdateOperationalAdBodyType,
  UpdateActivityAdBodyType,
  SystemMsgModalValueType,
  OperationalAdResponseType,
  ActivityAdResponseType
} from '@fastgpt/global/openapi/admin/support/user/inform/api';

export const postSendSystemMsg = (data: SendSystemInformBodyType) =>
  POST('/proApi/admin/support/user/inform/sendSystemInform', data);

// 系统公告
export const getSystemMsgModal = () =>
  GET<SystemMsgModalValueType>('/proApi/support/user/inform/getSystemMsgModal');
export const postUpdateSystemMsgModal = (data: UpdateSystemModalBodyType) =>
  POST('/proApi/admin/support/user/inform/updateSystemModal', data);

// 全屏广告
export const postUpdateOperationalAd = (data: UpdateOperationalAdBodyType) =>
  POST('/proApi/admin/support/user/inform/updateOperationalAd', data);
export const getOperationalAd = () =>
  GET<OperationalAdResponseType>('/proApi/support/user/inform/getOperationalAd');

// 底部广告
export const postUpdateActivityAd = (data: UpdateActivityAdBodyType) =>
  POST('/proApi/admin/support/user/inform/updateActivityAd', data);
export const getActivityAd = () =>
  GET<ActivityAdResponseType>('/proApi/support/user/inform/getActivityAd');
