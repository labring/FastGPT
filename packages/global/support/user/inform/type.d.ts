import { InformLevelEnum, SendInformTemplateCodeEnum } from './constants';

export type SendInformProps = {
  level: `${InformLevelEnum}`;
  templateCode: `${SendInformTemplateCodeEnum}`;
  templateParam: Record<string, any>;
  customLockMinutes?: number; // custom lock minutes
};

export type SendInform2UserProps = SendInformProps & {
  teamId: string;
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
