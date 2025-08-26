export type ChatSettingSchema = {
  _id: string;
  appId: string;
  teamId: string;
  slogan: string;
  dialogTips: string;
  enableHome: boolean;
  homeTabTitle: string;
  wideLogoUrl?: string;
  squareLogoUrl?: string;

  selectedTools: {
    pluginId: string;
    inputs?: Record<`${NodeInputKeyEnum}` | string, any>;
  }[];
  quickAppIds: string[];
  favouriteTags: {
    id: string;
    name: string;
  }[];
};

export type ChatSettingUpdateParams = Partial<Omit<ChatSettingSchema, '_id' | 'appId' | 'teamId'>>;

export type QuickAppType = { _id: string; name: string; avatar: string };
export type ChatFavouriteTagType = ChatSettingSchema['favouriteTags'][number];
export type SelectedToolType = ChatSettingSchema['selectedTools'][number] & {
  name: string;
  avatar: string;
};

export type ChatSettingReturnType =
  | (Omit<ChatSettingSchema, 'quickAppIds' | 'selectedTools'> & {
      quickAppList: QuickAppType[];
      selectedTools: SelectedToolType[];
    })
  | undefined;
