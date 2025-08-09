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
};

export type ChatSettingUpdateParams = {
  slogan?: string;
  dialogTips?: string;
  homeTabTitle?: string;
  wideLogoUrl?: string;
  squareLogoUrl?: string;
  selectedTools: {
    pluginId: string;
    inputs?: Record<`${NodeInputKeyEnum}` | string, any>;
  }[];
};
