export type GetWXLoginQRResponse = {
  code: string;
  codeUrl: string;
};

export type TrackRegisterParams = {
  inviterId?: string;
  bd_vid?: string;
  fastgpt_sem?: {
    keyword?: string;
    shortUrlSource?: string;
    shortUrlMedium?: string;
    shortUrlContent?: string;
  };
  sourceDomain?: string;
};
export type AccountRegisterBody = {
  username: string;
  code: string;
  password: string;
} & TrackRegisterParams;
