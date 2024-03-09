import { MongoImageTypeEnum } from './image/constants';
import { OutLinkChatAuthProps } from '../../support/permission/chat.d';

export type preUploadImgProps = OutLinkChatAuthProps & {
  type: `${MongoImageTypeEnum}`;

  expiredTime?: Date;
  metadata?: Record<string, any>;
};
export type UploadImgProps = preUploadImgProps & {
  base64Img: string;
};

export type UrlFetchParams = {
  urlList: string[];
  selector?: string;
};
export type UrlFetchResponse = {
  url: string;
  title: string;
  content: string;
  selector?: string;
}[];
