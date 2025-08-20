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
  quickApps: {
    id: string;
    order: number;
  }[];
  categories: {
    id: string;
    name: string;
  }[];
};

export type ChatSettingUpdateParams = Partial<Omit<ChatSettingSchema, '_id' | 'appId' | 'teamId'>>;

export type QuickApp = ChatSettingSchema['quickApps'][number] & { name: string; avatar: string };
export type Category = ChatSettingSchema['categories'][number] & { appIds: string[] };
