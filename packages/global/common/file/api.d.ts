import type { OutLinkChatAuthProps } from '../../support/permission/chat';

export type preUploadImgProps = OutLinkChatAuthProps & {
  // expiredTime?: Date;
  metadata?: Record<string, any>;
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
