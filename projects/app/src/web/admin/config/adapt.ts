import type { ConfigFormType, ConfigStoreType } from '@/pageComponents/admin/config/type';
import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
import type {
  FastGPTFeConfigsType,
  FastGPTRegisterMethodType
} from '@fastgpt/global/common/system/types';
import { SubTypeEnum } from '@fastgpt/global/support/wallet/sub/constants';

const removedFeConfigKeys = [['show', 'team', 'chat'].join('_'), 'mcpServerProxyEndpoint'];

const omitRemovedFeConfigs = <T extends object>(configs: T): T => {
  const filtered = { ...configs } as Record<string, unknown>;

  for (const key of removedFeConfigKeys) {
    delete filtered[key];
  }

  return filtered as T;
};

export function formatConfigStore2FormSchema({
  fastgpt,
  fastgptPro
}: ConfigStoreType): ConfigFormType {
  const { feConfigs, systemEnv, subPlans } = fastgpt || { feConfigs: {}, systemEnv: {} };
  const normalizedFeConfigs = omitRemovedFeConfigs({
    ...(feConfigs || {})
  } as FastGPTFeConfigsType);

  // 初始化配置
  const {
    show_emptyChat = false,
    show_openai_account = false,
    show_workorder = false,
    favicon = '',
    concatMd = '',
    docUrl = 'https://doc.fastgpt.io',
    loginGuideDocUrl = '',
    openAPIDocUrl = '',
    systemTitle = 'FastGPT',
    customApiDomain = '',
    customSharePageDomain = '',
    limit = {
      exportDatasetLimitMinutes: 20,
      websiteSyncLimitMinuted: 60
    },
    scripts = [],
    uploadFileMaxAmount = 15,
    uploadFileMaxSize = 500,
    sso,
    navbarItems = [],
    appTemplateCourse = '',
    show_compliance_copywriting = false,
    show_dataset_feishu = true,
    show_dataset_yuque = true,
    show_publish_feishu = true,
    show_publish_dingtalk = true,
    show_publish_wecom = false,
    show_publish_offiaccount = true,
    show_publish_wechat = true,
    enable_team_plugin_upload = false,
    botIframeUrl = '',
    ...feConfigsProps
  } = normalizedFeConfigs;

  const {
    openapiPrefix = 'openapi',
    datasetParseMaxProcess = 10,
    vectorMaxProcess = 10,
    qaMaxProcess = 10,
    hnswEfSearch = 100,
    oneapiUrl = '',
    chatApiKey = '',
    vlmMaxProcess = 5,
    customPdfParse,
    fileUrlWhitelist,
    workflowHttpNode = { ignoreHttpsCertificate: false },
    ...systemEnvProps
  } = systemEnv || {};

  return {
    siteSettings: {
      feConfigs: {
        show_workorder,
        show_emptyChat,
        show_openai_account,
        show_dataset_feishu,
        show_dataset_yuque,
        show_publish_feishu,
        show_publish_dingtalk,
        show_publish_wecom,
        show_publish_offiaccount,
        show_publish_wechat,
        enable_team_plugin_upload,
        favicon,
        docUrl,
        loginGuideDocUrl,
        openAPIDocUrl,
        systemTitle,
        customApiDomain,
        customSharePageDomain,
        uploadFileMaxAmount,
        uploadFileMaxSize,
        appTemplateCourse,
        show_compliance_copywriting,
        botIframeUrl,
        ...feConfigsProps
      },
      concatMd,
      scripts: JSON.stringify(scripts, null, 2),
      limit,
      navbar: navbarItems || [],
      systemEnv: {
        openapiPrefix,
        datasetParseMaxProcess,
        vectorMaxProcess,
        qaMaxProcess,
        hnswEfSearch,
        oneapiUrl,
        chatApiKey,
        vlmMaxProcess,
        customPdfParse,
        fileUrlWhitelist,
        workflowHttpNode,
        ...systemEnvProps
      }
    },
    loginSettings: {
      github: {
        clientId: fastgptPro?.auth?.github?.clientId || '',
        secret: fastgptPro?.auth?.github?.secret || ''
      },
      google: {
        clientId: fastgptPro?.auth?.google?.clientId || '',
        secret: fastgptPro?.auth?.google?.secret || ''
      },
      microsoft: {
        clientId: fastgptPro?.auth?.microsoft?.clientId || '',
        secret: fastgptPro?.auth?.microsoft?.secret || '',
        tenantId: fastgptPro?.auth?.microsoft?.tenantId || '',
        customButton: fastgptPro?.auth?.microsoft?.customButton || ''
      },
      email: {
        smtp: fastgptPro?.auth?.email?.smtp || '',
        user: fastgptPro?.auth?.email?.user || '',
        pass: fastgptPro?.auth?.email?.pass || '',
        register: fastgptPro?.auth?.email?.register || false,
        port: fastgptPro?.auth?.email?.port || 465,
        secure: fastgptPro?.auth?.email?.secure ?? true
      },
      sms: {
        REGISTER: fastgptPro?.auth?.sms?.REGISTER || '',
        RESET_PASSWORD: fastgptPro?.auth?.sms?.RESET_PASSWORD || '',
        BIND_NOTIFICATION: fastgptPro?.auth?.sms?.BIND_NOTIFICATION || '',
        ACCOUNT_CANCELLATION: fastgptPro?.auth?.sms?.ACCOUNT_CANCELLATION || '',
        ACCOUNT_CANCELLATION_EN: fastgptPro?.auth?.sms?.ACCOUNT_CANCELLATION_EN || '',
        ACCOUNT_CANCELLATION_REMINDER: fastgptPro?.auth?.sms?.ACCOUNT_CANCELLATION_REMINDER || '',
        ACCOUNT_CANCELLATION_REMINDER_EN:
          fastgptPro?.auth?.sms?.ACCOUNT_CANCELLATION_REMINDER_EN ||
          fastgptPro?.auth?.sms?.ACCOUNT_CANCELLATION_REMINDER ||
          '',
        ACCOUNT_CANCELLATION_TODAY: fastgptPro?.auth?.sms?.ACCOUNT_CANCELLATION_TODAY || '',
        ACCOUNT_CANCELLATION_TODAY_EN:
          fastgptPro?.auth?.sms?.ACCOUNT_CANCELLATION_TODAY_EN ||
          fastgptPro?.auth?.sms?.ACCOUNT_CANCELLATION_TODAY ||
          '',
        EXPIRE_SOON: fastgptPro?.auth?.sms?.EXPIRE_SOON || '',
        EXPIRED: fastgptPro?.auth?.sms?.EXPIRED || '',
        FREE_CLEAN: fastgptPro?.auth?.sms?.FREE_CLEAN || '',
        BIND_NOTIFICATION_EN:
          fastgptPro.auth?.sms.BIND_NOTIFICATION_EN || fastgptPro.auth?.sms.BIND_NOTIFICATION || '',
        EXPIRED_EN: fastgptPro.auth?.sms.EXPIRED_EN || fastgptPro.auth?.sms.EXPIRED || '',
        EXPIRE_SOON_EN:
          fastgptPro.auth?.sms.EXPIRE_SOON_EN || fastgptPro.auth?.sms.EXPIRE_SOON || '',
        FREE_CLEAN_EN: fastgptPro.auth?.sms.FREE_CLEAN_EN || fastgptPro.auth?.sms.FREE_CLEAN || '',
        LACK_OF_POINTS: fastgptPro.auth?.sms.LACK_OF_POINTS || '',
        LACK_OF_POINTS_EN:
          fastgptPro.auth?.sms.LACK_OF_POINTS_EN || fastgptPro.auth?.sms.LACK_OF_POINTS || '',
        POINTS_TEN_PERCENT_REMAIN: fastgptPro.auth?.sms.POINTS_TEN_PERCENT_REMAIN || '',
        POINTS_TEN_PERCENT_REMAIN_EN:
          fastgptPro.auth?.sms.POINTS_TEN_PERCENT_REMAIN_EN ||
          fastgptPro.auth?.sms.POINTS_TEN_PERCENT_REMAIN ||
          '',
        POINTS_THIRTY_PERCENT_REMAIN: fastgptPro.auth?.sms.POINTS_THIRTY_PERCENT_REMAIN || '',
        POINTS_THIRTY_PERCENT_REMAIN_EN:
          fastgptPro.auth?.sms.POINTS_THIRTY_PERCENT_REMAIN_EN ||
          fastgptPro.auth?.sms.POINTS_THIRTY_PERCENT_REMAIN ||
          '',
        REGISTER_EN: fastgptPro.auth?.sms.REGISTER_EN || fastgptPro.auth?.sms.REGISTER || '',
        RESET_PASSWORD_EN:
          fastgptPro.auth?.sms.RESET_PASSWORD_EN || fastgptPro.auth?.sms.RESET_PASSWORD || ''
      },
      phone: {
        SNED_PHONE_ACCESSKEYID: fastgptPro?.auth?.phone?.SNED_PHONE_ACCESSKEYID || '',
        SNED_PHONE_ACCESSSECRET: fastgptPro?.auth?.phone?.SNED_PHONE_ACCESSSECRET || '',
        SNED_PHONE_SIGNNAME: fastgptPro?.auth?.phone?.SNED_PHONE_SIGNNAME || ''
        // SNED_PHONE_TEMPLATE: fastgptPro?.auth?.phone?.SNED_PHONE_TEMPLATE || ''
      },
      wechat: {
        appID: fastgptPro?.auth?.wechat?.appID || '',
        appSecret: fastgptPro?.auth?.wechat?.appSecret || ''
      },
      wecom: {
        encodingAESKey: fastgptPro.auth?.wecom?.encodingAESKey || '',
        secret: fastgptPro.auth?.wecom?.secret || '',
        suiteId: fastgptPro.auth?.wecom?.suiteId || '',
        token: fastgptPro.auth?.wecom?.token || '',
        advancedVersionId: fastgptPro.auth?.wecom?.advancedVersionId || '',
        basicVersionId: fastgptPro.auth?.wecom?.basicVersionId || '',
        buyerUserId: fastgptPro.auth?.wecom?.buyerUserId || '',
        cropId: fastgptPro.auth?.wecom?.cropId || '',
        paySecret: fastgptPro.auth?.wecom?.paySecret || '',
        providerSecret: fastgptPro.auth?.wecom?.providerSecret || ''
      },
      fastLogin: JSON.stringify(fastgptPro.fastLogin || {}, null, 2),
      teamMode: fastgptPro.teamMode,
      accountCancellation: fastgptPro.accountCancellation,
      sso
    },
    paySettings: {
      wx: fastgptPro?.pay?.wx || {},
      alipay: fastgptPro?.pay?.alipay || {},
      bank: fastgptPro?.pay?.bank || {},
      subPlans: {
        planDescriptionUrl: subPlans?.planDescriptionUrl || '',
        appRegistrationUrl: subPlans?.appRegistrationUrl || '',
        communitySupportTip: subPlans?.communitySupportTip || '',
        activityExpirationTime: subPlans?.activityExpirationTime,
        standard: subPlans?.[SubTypeEnum.standard],
        extraDatasetSizePrice: subPlans?.[SubTypeEnum.extraDatasetSize]?.price || 0,
        extraPointsPackages: subPlans?.[SubTypeEnum.extraPoints]?.packages || []
      }
    },
    securitySettings: {
      censor: {
        BAIDU_TEXT_CENSOR_CLIENTID: fastgptPro?.censor?.BAIDU_TEXT_CENSOR_CLIENTID || '',
        BAIDU_TEXT_CENSOR_CLIENTSECRET: fastgptPro?.censor?.BAIDU_TEXT_CENSOR_CLIENTSECRET || '',
        customCensorURL: fastgptPro?.censor?.customCensorURL || ''
      }
    },
    externalProviderSettings: {
      externalProviderWorkflowVariables: fastgpt?.feConfigs?.externalProviderWorkflowVariables || []
    }
  };
}

export function formatFormData2ConfigStore({
  siteSettings,
  loginSettings,
  paySettings,
  securitySettings,
  externalProviderSettings,
  securitySystemEnvUpdates
}: ConfigFormType & {
  securitySystemEnvUpdates?: Pick<
    ConfigFormType['siteSettings']['systemEnv'],
    'fileUrlWhitelist' | 'workflowHttpNode'
  >;
}): ConfigStoreType {
  const { feConfigs, systemEnv, concatMd, scripts, limit, navbar } = siteSettings;
  const {
    email,
    phone,
    github,
    wechat,
    google,
    fastLogin,
    sms,
    microsoft,
    teamMode,
    accountCancellation,
    sso,
    wecom
  } = loginSettings;
  const { censor } = securitySettings;
  const { wx, alipay, bank, subPlans } = paySettings;
  const { externalProviderWorkflowVariables } = externalProviderSettings;

  const finalSystemEnv = securitySystemEnvUpdates
    ? { ...systemEnv, ...securitySystemEnvUpdates }
    : systemEnv;

  const formatFeConfig: FastGPTFeConfigsType = omitRemovedFeConfigs({
    ...feConfigs,
    concatMd,
    scripts: (() => {
      try {
        return scripts ? JSON.parse(scripts) : [];
      } catch {
        return [];
      }
    })(),
    limit,
    oauth: {
      github: github?.clientId,
      google: google?.clientId,
      wechat: wechat?.appID && wechat?.appSecret ? wechat.appID : undefined,
      microsoft: microsoft?.clientId
        ? {
            clientId: microsoft?.clientId,
            tenantId: microsoft?.tenantId,
            customButton: microsoft?.customButton
          }
        : undefined,
      wecom: !!wecom
    },
    sso,
    teamMode,
    accountCancellation,
    payConfig: {
      wx: !!wx?.WX_PRIVATE_KEY,
      alipay: !!alipay?.ALIPAY_ROOT_CERT_CONTENT,
      bank: !!bank?.description
    },
    register_method: (() => {
      const methods: FastGPTRegisterMethodType[] = [];
      if (loginSettings?.email?.register) {
        methods.push('email');
      }
      if (loginSettings?.sms?.REGISTER) {
        methods.push('phone');
      }
      return methods;
    })(),
    login_method: (() => {
      const methods: FastGPTRegisterMethodType[] = [];
      if (loginSettings?.email?.register) {
        methods.push('email');
      }
      if (loginSettings?.sms?.REGISTER) {
        methods.push('phone');
      }
      return methods;
    })(),
    find_password_method: (() => {
      const methods: FastGPTRegisterMethodType[] = [];
      if (loginSettings?.email?.register) {
        methods.push('email');
      }
      if (loginSettings?.sms?.RESET_PASSWORD) {
        methods.push('phone');
      }
      return methods;
    })(),
    bind_notification_method: (() => {
      const methods: FastGPTRegisterMethodType[] = [];
      if (email?.smtp) {
        methods.push('email');
      }
      if (loginSettings?.sms?.BIND_NOTIFICATION) {
        methods.push('phone');
      }
      return methods;
    })(),
    navbarItems: Array.isArray(navbar) ? navbar : [],
    externalProviderWorkflowVariables
  });

  formatFeConfig.show_pay = !!(
    formatFeConfig.payConfig?.wx ||
    formatFeConfig.payConfig?.alipay ||
    formatFeConfig.payConfig?.bank
  );

  const formatLoginSettings = {
    email,
    phone,
    wechat,
    wecom,
    github,
    google,
    microsoft,
    sms
  };

  const standardSubPlanJson = subPlans.standard;
  const extraPointsPackages = subPlans.extraPointsPackages || [];

  return {
    [SystemConfigsTypeEnum.fastgpt]: {
      feConfigs: formatFeConfig,
      systemEnv: {
        ...finalSystemEnv,
        fileUrlWhitelist: finalSystemEnv.fileUrlWhitelist || []
      },
      subPlans: {
        planDescriptionUrl: subPlans.planDescriptionUrl ?? '',
        appRegistrationUrl: subPlans.appRegistrationUrl ?? '',
        communitySupportTip: subPlans.communitySupportTip ?? '',
        activityExpirationTime: subPlans.activityExpirationTime,
        [SubTypeEnum.standard]: standardSubPlanJson,
        [SubTypeEnum.extraDatasetSize]: {
          price: subPlans.extraDatasetSizePrice || 0
        },
        [SubTypeEnum.extraPoints]: {
          packages: extraPointsPackages
        }
      }
    },
    [SystemConfigsTypeEnum.fastgptPro]: {
      auth: formatLoginSettings,
      censor,
      fastLogin: (() => {
        try {
          return JSON.parse(fastLogin);
        } catch {
          return {};
        }
      })(),
      teamMode,
      accountCancellation,
      pay: {
        wx,
        alipay,
        bank
      }
    }
  };
}
