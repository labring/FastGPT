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
  tags: {
    id: string;
    name: string;
  }[];
};

export type ChatSettingUpdateParams = Partial<Omit<ChatSettingSchema, '_id' | 'appId' | 'teamId'>>;

export type QuickAppType = { id: string; name: string; avatar: string };
export type ChatTagType = ChatSettingSchema['tags'][number];
export type SelectedToolType = ChatSettingSchema['selectedTools'][number] & {
  name: string;
  avatar: string;
};

export type ChatSettingReturnType =
  | (Omit<ChatSettingSchema, 'quickApps' | 'selectedTools'> & {
      quickApps: QuickAppType[];
      selectedTools: SelectedToolType[];
    })
  | undefined;
