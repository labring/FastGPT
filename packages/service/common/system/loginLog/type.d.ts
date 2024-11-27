import { LoginStatusEnum, LoginTypeEnum } from './constant';

export type LoginLogType = {
  _id: string;
  userName: string;
  status: LoginStatusEnum;
  type: LoginTypeEnum;
  msg: string;
  ip: string;
  client: string;
  time: Date;
};
