/**
 * settings/config 管理员页面本地类型。
 * 从 pro/admin 迁移（types/index.ts、global/admin/config.ts、global/settings/constants.ts），
 * 去除了 pg 依赖与 declare global 全局声明，仅保留表单所需类型。
 */
import type {
  FastGPTConfigFileType,
  ExternalProviderWorkflowVarType,
  customPdfParseType,
  NavbarItemType
} from '@fastgpt/global/common/system/types';
import type { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
import type {
  PointsPackageItem,
  StandSubPlanLevelMapType
} from '@fastgpt/global/support/wallet/sub/type';

export enum TeamModeEnum {
  multi = 'multi', // 多团队模式 (默认)
  single = 'single', // 单团队模式
  sync = 'sync' // 同步模式
}

export type SystemConfigType = {
  censor?: {
    BAIDU_TEXT_CENSOR_CLIENTID?: string;
    BAIDU_TEXT_CENSOR_CLIENTSECRET?: string;
    customCensorURL?: string; // custom censor check url, which has higher priority than baidu
  };
  fileUrlWhitelist?: string[];
  auth?: {
    github?: {
      clientId: string;
      secret: string;
    };
    google?: {
      clientId: string;
      secret: string;
    };
    microsoft?: {
      clientId: string;
      secret: string;
      tenantId: string;
      customButton?: string;
    };
    email?: {
      smtp: string;
      user: string;
      pass: string;
      register: boolean;
      port?: number;
      secure?: boolean;
    };
    sms: {
      REGISTER: string;
      RESET_PASSWORD: string;
      BIND_NOTIFICATION: string;
      ACCOUNT_CANCELLATION?: string;
      ACCOUNT_CANCELLATION_EN?: string;
      ACCOUNT_CANCELLATION_REMINDER?: string;
      ACCOUNT_CANCELLATION_REMINDER_EN?: string;
      ACCOUNT_CANCELLATION_TODAY?: string;
      ACCOUNT_CANCELLATION_TODAY_EN?: string;
      EXPIRE_SOON: string;
      EXPIRED: string;
      FREE_CLEAN: string;
      LACK_OF_POINTS: string;
      POINTS_THIRTY_PERCENT_REMAIN: string;
      POINTS_TEN_PERCENT_REMAIN: string;
      REGISTER_EN: string;
      RESET_PASSWORD_EN: string;
      BIND_NOTIFICATION_EN: string;
      EXPIRE_SOON_EN: string;
      EXPIRED_EN: string;
      FREE_CLEAN_EN: string;
      LACK_OF_POINTS_EN: string;
      POINTS_THIRTY_PERCENT_REMAIN_EN: string;
      POINTS_TEN_PERCENT_REMAIN_EN: string;
    };
    phone?: {
      SNED_PHONE_ACCESSKEYID: string;
      SNED_PHONE_ACCESSSECRET: string;
      SNED_PHONE_SIGNNAME: string;
    };
    wechat?: {
      appID: string;
      appSecret: string;
    };
    dingtalk?: {
      clientId: string;
      secret: string;
    };
    wecom?: {
      suiteId: string;
      secret: string;
      token: string;
      encodingAESKey: string;
      cropId: string;
      providerSecret: string;
      buyerUserId: string;
      basicVersionId: string;
      advancedVersionId: string;
      paySecret: string;
    };
  };
  pay?: {
    wx?: {
      WX_APPID?: string;
      WX_MCHID?: string;
      WX_SERIAL_NO?: string;
      WX_V3_CODE?: string;
      WX_NOTIFY_URL?: string;
      WX_PRIVATE_KEY?: string;
    };
    alipay?: {
      APP_ID?: string;
      APP_PRIVATE_KEY?: string;
      APP_CERT_CONTENT?: string;
      ALIPAY_GATEWAY?: string;
      ALIPAY_ROOT_CERT_CONTENT?: string;
      ALIPAY_PUBLIC_CERT_CONTENT?: string;
      ALIPAY_ENDPOINT?: string;
      ALIPAY_NOTIFY_URL?: string;
    };
    bank?: {
      description?: string;
    };
  };
  fastLogin?: Record<
    string,
    {
      authUrl: string;
    }
  >;
  accountCancellation?: {
    enabled?: boolean;
  };
  teamMode?: `${TeamModeEnum}`;
};

export type ConfigStoreType = {
  [SystemConfigsTypeEnum.fastgpt]: FastGPTConfigFileType;
  [SystemConfigsTypeEnum.fastgptPro]: SystemConfigType;
};

export type ConfigFormType = {
  siteSettings: {
    feConfigs: {
      show_workorder: boolean;
      appTemplateCourse: string;
      show_emptyChat: boolean;
      show_openai_account: boolean;
      show_compliance_copywriting: boolean;
      show_dataset_feishu: boolean;
      show_dataset_yuque: boolean;
      show_publish_feishu: boolean;
      show_publish_dingtalk: boolean;
      show_publish_wecom: boolean;
      show_publish_offiaccount: boolean;
      show_publish_wechat: boolean;
      enable_team_plugin_upload: boolean;
      favicon: string;
      docUrl: string;
      loginGuideDocUrl: string;
      openAPIDocUrl: string;
      systemTitle: string;
      customApiDomain: string;
      customSharePageDomain: string;
      uploadFileMaxAmount: number;
      uploadFileMaxSize: number;
      botIframeUrl: string;
      ip_whitelist?: string;
      customDomain?: {
        enable?: boolean;
        domain?: {
          aliyun?: string;
          tencent?: string;
          volcengine?: string;
        };
      };
    };
    concatMd: string;
    scripts?: string;
    limit?: FastGPTConfigFileType['feConfigs']['limit'];
    systemEnv: {
      oneapiUrl?: string;
      chatApiKey: string;
      openapiPrefix: string;
      datasetParseMaxProcess: number;
      vectorMaxProcess: number;
      qaMaxProcess: number;
      vlmMaxProcess: number;
      hnswEfSearch: number;
      hnswMaxScanTuples: number;
      customPdfParse?: customPdfParseType;
      fileUrlWhitelist?: string[];
      workflowHttpNode?: {
        ignoreHttpsCertificate?: boolean;
      };
      customDomain?: {
        kc?: {
          aliyun?: string;
          tencent?: string;
          volcengine?: string;
        };
        issuerServiceName?: {
          aliyun?: string;
          tencent?: string;
          volcengine?: string;
        };
        nginxServiceName?: {
          aliyun?: string;
          tencent?: string;
          volcengine?: string;
        };
      };
    };
    navbar?: NavbarItemType[];
  };
  loginSettings: {
    email: NonNullable<SystemConfigType['auth']>['email'];
    phone: NonNullable<SystemConfigType['auth']>['phone'];
    sms: NonNullable<SystemConfigType['auth']>['sms'];
    github: NonNullable<SystemConfigType['auth']>['github'];
    wechat: NonNullable<SystemConfigType['auth']>['wechat'];
    wecom: NonNullable<SystemConfigType['auth']>['wecom'];
    google: NonNullable<SystemConfigType['auth']>['google'];
    microsoft: NonNullable<SystemConfigType['auth']>['microsoft'];
    fastLogin: string;
    teamMode?: `${TeamModeEnum}`;
    accountCancellation?: SystemConfigType['accountCancellation'];
    sso?: {
      title?: string;
      icon?: string;
      url?: string;
      autoLogin?: boolean;
    };
  };
  paySettings: {
    wx: NonNullable<SystemConfigType['pay']>['wx'];
    alipay: NonNullable<SystemConfigType['pay']>['alipay'];
    bank: NonNullable<SystemConfigType['pay']>['bank'];
    subPlans: {
      planDescriptionUrl: string;
      appRegistrationUrl: string;
      communitySupportTip: string;
      activityExpirationTime?: Date;
      standard?: StandSubPlanLevelMapType;
      extraDatasetSizePrice: number;
      extraPointsPackages: PointsPackageItem[];
    };
  };
  securitySettings: {
    censor?: SystemConfigType['censor'];
  };
  externalProviderSettings: {
    externalProviderWorkflowVariables: ExternalProviderWorkflowVarType[];
  };
};
