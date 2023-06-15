import { GET, POST, PUT } from './request';
import { createHashPassword, Obj2Query } from '@/utils/tools';
import { ResLogin, PromotionRecordType } from './response/user';
import { UserAuthTypeEnum } from '@/constants/common';
import { UserBillType, UserType, UserUpdateParams } from '@/types/user';
import type { PagingData, RequestPaging } from '@/types';
import { informSchema, PaySchema } from '@/types/mongoSchema';

export const sendAuthCode = (data: {
  username: string;
  type: `${UserAuthTypeEnum}`;
  googleToken: string;
}) => POST('/user/sendAuthCode', data);

export const getTokenLogin = () => GET<UserType>('/user/tokenLogin');

/* get promotion init data */
export const getPromotionInitData = () =>
  GET<{
    invitedAmount: number;
    historyAmount: number;
    residueAmount: number;
  }>('/user/promotion/getPromotionData');

export const postRegister = ({
  username,
  password,
  code,
  inviterId
}: {
  username: string;
  code: string;
  password: string;
  inviterId: string;
}) =>
  POST<ResLogin>('/user/register', {
    username,
    code,
    inviterId,
    password: createHashPassword(password)
  });

export const postFindPassword = ({
  username,
  code,
  password
}: {
  username: string;
  code: string;
  password: string;
}) =>
  POST<ResLogin>('/user/updatePasswordByCode', {
    username,
    code,
    password: createHashPassword(password)
  });

export const postLogin = ({ username, password }: { username: string; password: string }) =>
  POST<ResLogin>('/user/loginByPassword', {
    username,
    password: createHashPassword(password)
  });

export const loginOut = () => GET('/user/loginout');

export const putUserInfo = (data: UserUpdateParams) => PUT('/user/update', data);

export const getUserBills = (data: RequestPaging) =>
  POST<PagingData<UserBillType>>(`/user/getBill`, data);

export const getPayOrders = () => GET<PaySchema[]>(`/user/getPayOrders`);

export const getPayCode = (amount: number) =>
  GET<{
    codeUrl: string;
    payId: string;
  }>(`/user/getPayCode?amount=${amount}`);

export const checkPayResult = (payId: string) => GET<number>(`/user/checkPayResult?payId=${payId}`);

/* promotion records */
export const getPromotionRecords = (data: RequestPaging) =>
  GET<PromotionRecordType>(`/user/promotion/getPromotions?${Obj2Query(data)}`);

export const getInforms = (data: RequestPaging) =>
  POST<PagingData<informSchema>>(`/user/inform/list`, data);

export const getUnreadCount = () => GET<number>(`/user/inform/countUnread`);
export const readInform = (id: string) => GET(`/user/inform/read`, { id });
