import { GET, POST, PUT } from './request';
import { createHashPassword, Obj2Query } from '@/utils/tools';
import { ResLogin } from './response/user';
import { EmailTypeEnum } from '@/constants/common';
import { UserType, UserUpdateParams } from '@/types/user';
import type { PagingData, RequestPaging } from '@/types';
import { BillSchema } from '@/types/mongoSchema';
import { adaptBill } from '@/utils/adapt';

export const sendCodeToEmail = ({ email, type }: { email: string; type: `${EmailTypeEnum}` }) =>
  GET('/user/sendEmail', { email, type });

export const getTokenLogin = () => GET<UserType>('/user/tokenLogin');

export const postRegister = ({
  email,
  password,
  code
}: {
  email: string;
  code: string;
  password: string;
}) =>
  POST<ResLogin>('/user/register', {
    email,
    code,
    password: createHashPassword(password)
  });

export const postFindPassword = ({
  email,
  code,
  password
}: {
  email: string;
  code: string;
  password: string;
}) =>
  POST<ResLogin>('/user/updatePasswordByCode', {
    email,
    code,
    password: createHashPassword(password)
  });

export const postLogin = ({ email, password }: { email: string; password: string }) =>
  POST<ResLogin>('/user/loginByPassword', {
    email,
    password: createHashPassword(password)
  });

export const putUserInfo = (data: UserUpdateParams) => PUT('/user/update', data);

export const getUserBills = (data: RequestPaging) =>
  GET<PagingData<BillSchema>>(`/user/getBill?${Obj2Query(data)}`).then((res) => ({
    ...res,
    data: res.data.map((bill) => adaptBill(bill))
  }));

export const getPayCode = (amount: number) =>
  GET<{
    codeUrl: string;
    orderId: string;
  }>(`/user/getPayCode?amount=${amount}`);

export const checkPayResult = (orderId: string) =>
  GET<number>(`/user/checkPayResult?orderId=${orderId}`);
