export type ShortUrlParams = {
  shortUrlSource?: string; // Article, video
  shortUrlMedium?: string; // bilibili, youtube
  shortUrlContent?: string; // project id
};

export type TrackRegisterParams = {
  inviterId?: string;
  bd_vid?: string;
  fastgpt_sem?: {
    keyword?: string;
  } & ShortUrlParams;
  sourceDomain?: string;
};
