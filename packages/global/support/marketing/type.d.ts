export type ShortUrlParams = {
  shortUrlSource?: string; // Article, video
  shortUrlMedium?: string; // bilibili, youtube
  shortUrlContent?: string; // project id
};

export type TrackRegisterParams = {
  inviterId?: string;
  bd_vid?: string;
  msclkid?: string;
  fastgpt_sem?: {
    keyword?: string;
    search?: string;
  } & ShortUrlParams;
  sourceDomain?: string;
};
