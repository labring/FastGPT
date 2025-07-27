import type { OutLinkChatAuthProps } from '../../support/permission/chat.d';
import type { ImageTypeEnum } from './image/type.d';

export type preUploadImgProps = OutLinkChatAuthProps & {
  // expiredTime?: Date;
  metadata?: Record<string, any>;
};
export type UploadImgProps = preUploadImgProps & {
  base64Img: string;
  imageType?: `${ImageTypeEnum}`;
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
