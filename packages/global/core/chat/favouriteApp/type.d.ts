export type ChatFavouriteAppSchema = {
  _id: string;
  teamId: string;
  appId: string;
  categories: string[]; // category id list
  order: number;
};

export type ChatFavouriteAppUpdateParams = {
  appId: string;
  categories: string[];
  order: number;
};

export type ChatFavouriteApp = ChatFavouriteAppSchema & {
  name: string;
  avatar: string;
  intro: string;
};
