import { MongoImageTypeEnum } from './image/constants';

export type preUploadImgProps = {
  type: `${MongoImageTypeEnum}`;

  expiredTime?: Date;
  metadata?: Record<string, any>;
  shareId?: string;
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
