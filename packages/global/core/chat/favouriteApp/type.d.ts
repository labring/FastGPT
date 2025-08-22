export type ChatFavouriteAppSchema = {
  _id: string;
  teamId: string;
  appId: string;
  tags: string[]; // tag id list
  order: number;
};

export type ChatFavouriteAppUpdateParams = {
  appId: string;
  order: number;
};

export type ChatFavouriteApp = ChatFavouriteAppSchema & {
  name: string;
  avatar: string;
  intro: string;
};
