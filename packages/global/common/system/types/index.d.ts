export type FeConfigsType = {
  show_emptyChat?: boolean;
  show_register?: boolean;
  show_appStore?: boolean;
  show_contact?: boolean;
  show_git?: boolean;
  show_pay?: boolean;
  show_openai_account?: boolean;
  show_promotion?: boolean;
  hide_app_flow?: boolean;
  docUrl?: string;
  openAPIDocUrl?: string;
  systemTitle?: string;
  authorText?: string;
  googleClientVerKey?: string;
  isPlus?: boolean;
  oauth?: {
    github?: string;
    google?: string;
  };
  limit?: {
    exportLimitMinutes?: number;
  };
  scripts?: { [key: string]: string }[];
  favicon?: string;
  ability_image_1?: string;
  ability_image_2?: string;
  ability_image_3?: string;
  ability_image_4?: string;
  video_url?: string;
  video_image_pc?: string;
  video_image_mobile?: string;
};

export type SystemEnvType = {
  pluginBaseUrl?: string;
  openapiPrefix?: string;
  vectorMaxProcess: number;
  qaMaxProcess: number;
  pgHNSWEfSearch: number;
};

declare global {
  var feConfigs: FeConfigsType;
  var systemEnv: SystemEnvType;
}
