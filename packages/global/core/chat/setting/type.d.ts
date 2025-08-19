export type ChatSettingSchema = {
  _id: string;
  appId: string;
  teamId: string;
  slogan: string;
  dialogTips: string;
  homeTabTitle: string;
  wideLogoUrl?: string;
  squareLogoUrl?: string;

  selectedTools: {
    pluginId: string;
    name: string;
    avatar: string;
    inputs?: Record<`${NodeInputKeyEnum}` | string, any>;
  }[];
  quickAppIds: string[];
  categories: {
    id: string;
    name: string;
  }[];
};

export type ChatSettingUpdateParams = Partial<Omit<ChatSettingSchema, '_id' | 'appId' | 'teamId'>>;
