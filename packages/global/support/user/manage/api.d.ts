import { UserStatusEnum } from '../constant';

export type UserManageType = {
  _id?: string;
  username: string;
  password: string;
  password2?: string;
  inviterId?: string;
  status: `${UserStatusEnum}`;
};
