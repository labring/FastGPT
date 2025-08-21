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
    inputs?: Record<`${NodeInputKeyEnum}` | string, any>;
  }[];
  quickApps: string[];
  categories: {
    id: string;
    name: string;
  }[];
};

export type ChatSettingUpdateParams = Partial<Omit<ChatSettingSchema, '_id' | 'appId' | 'teamId'>>;

export type QuickApp = { id: string; name: string; avatar: string };
export type Category = ChatSettingSchema['categories'][number];
export type SelectedTool = ChatSettingSchema['selectedTools'][number] & {
  name: string;
  avatar: string;
};
