import { InformTypeEnum } from './constant';

export type SendInformProps = {
  tmbId?: string;
  type: `${InformTypeEnum}`;
  title: string;
  content: string;
};

export type UserInformSchema = {
  _id: string;
  userId: string;
  time: Date;
  type: `${InformTypeEnum}`;
  title: string;
  content: string;
  read: boolean;
};
