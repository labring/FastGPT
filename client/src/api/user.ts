import { GET, POST, PUT } from './request';
import { createHashPassword } from '@/utils/tools';
import type { ResLogin, PromotionRecordType } from './response/user';
import { UserAuthTypeEnum } from '@/constants/common';
import { UserBillType, UserType, UserUpdateParams } from '@/types/user';
import type { PagingData, RequestPaging } from '@/types';
import { informSchema, PaySchema } from '@/types/mongoSchema';
import { OAuthEnum } from '@/constants/user';

export const sendAuthCode = (data: {
  username: string;
  type: `${UserAuthTypeEnum}`;
  googleToken: string;
}) => POST(`/plusApi/user/inform/sendAuthCode`, data);

export const getTokenLogin = () => GET<UserType>('/user/account/tokenLogin');
export const oauthLogin = (params: {
  type: `${OAuthEnum}`;
  code: string;
  callbackUrl: string;
  inviterId?: string;
}) => POST<ResLogin>('/plusApi/user/account/login/oauth', params);

export const postRegister = ({
  username,
  password,
  code,
  inviterId
}: {
  username: string;
  code: string;
  password: string;
  inviterId?: string;
}) =>
  POST<ResLogin>(`/plusApi/user/account/register/emailAndPhone`, {
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
  POST<ResLogin>(`/plusApi/user/account/password/updateByCode`, {
    username,
    code,
    password: createHashPassword(password)
  });

export const updatePasswordByOld = ({ oldPsw, newPsw }: { oldPsw: string; newPsw: string }) =>
  POST('/user/account/updatePasswordByOld', {
    oldPsw: createHashPassword(oldPsw),
    newPsw: createHashPassword(newPsw)
  });

export const postLogin = ({ username, password }: { username: string; password: string }) =>
  POST<ResLogin>('/user/account/loginByPassword', {
    username,
    password: createHashPassword(password)
  });

export const loginOut = () => GET('/user/account/loginout');

export const putUserInfo = (data: UserUpdateParams) => PUT('/user/account/update', data);

export const getUserBills = (data: RequestPaging) =>
  POST<PagingData<UserBillType>>(`/user/getBill`, data);

export const getPayOrders = () => GET<PaySchema[]>(`/user/getPayOrders`);

export const getPayCode = (amount: number) =>
  GET<{
    codeUrl: string;
    payId: string;
  }>(`/plusApi/user/pay/getPayCode`, { amount });

export const checkPayResult = (payId: string) =>
  GET<number>(`/plusApi/user/pay/checkPayResult`, { payId }).then(() => {
    try {
      GET('/user/account/paySuccess');
    } catch (error) {}
    return 'success';
  });

export const getInforms = (data: RequestPaging) =>
  POST<PagingData<informSchema>>(`/user/inform/list`, data);

export const getUnreadCount = () => GET<number>(`/user/inform/countUnread`);
export const readInform = (id: string) => GET(`/user/inform/read`, { id });

/* get promotion init data */
export const getPromotionInitData = () =>
  GET<{
    invitedAmount: number;
    earningsAmount: number;
  }>('/user/promotion/getPromotionData');

/* promotion records */
export const getPromotionRecords = (data: RequestPaging) =>
  POST<PromotionRecordType>(`/user/promotion/getPromotions`, data);
