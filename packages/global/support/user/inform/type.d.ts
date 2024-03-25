import { InformTypeEnum } from './constants';

export type SendInformProps = {
  title: string;
  content: string;
};
export type SendInform2UserProps = SendInformProps & {
  tmbId: string;
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
