import { InformLevelEnum } from './constants';

export type SendInformProps = {
  level: `${InformLevelEnum}`;
  templateCode: string;
  templateParams: {
    title: string;
    content: string;
  };
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
