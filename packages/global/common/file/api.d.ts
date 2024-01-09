export type UploadImgProps = {
  base64Img: string;
  expiredTime?: Date;
  metadata?: Record<string, any>;
  shareId?: string;
};

export type UrlFetchParams = {
  urlList: string[];
  selector?: string;
};
export type UrlFetchResponse = {
  url: string;
  content: string;
  selector?: string;
}[];
