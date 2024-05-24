import { InformLevelEnum } from './constants';

export type SendInformProps = {
  title: string;
  content: string;
  level: `${InformLevelEnum}`;
};
export type SendInform2UserProps = SendInformProps & {
  tmbId: string;
};
export type SendInform2User = SendInformProps & {
  type: `${InformTypeEnum}`;
  tmbId: string;
};

export type UserInformSchema = {
  _id: string;
  userId: string;
  time: Date;
  level: `${InformLevelEnum}`;
  title: string;
  content: string;
  read: boolean;
};
