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
