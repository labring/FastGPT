import { GET, POST, PUT } from './request';
import { createHashPassword } from '@/utils/tools';
import { ResLogin } from './response/user';
import { EmailTypeEnum } from '@/constants/common';
import { UserType, UserUpdateParams } from '@/types/user';

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
