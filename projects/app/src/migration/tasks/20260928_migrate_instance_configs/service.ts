import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
import {
  SYSTEM_INSTANCE_CONFIG_SCHEMA_VERSION,
  SYSTEM_INSTANCE_CONFIG_DOMAINS,
  type SystemInstanceConfigDomainKey,
  getDomainDefaultConfig,
  resolveDomainEffectiveConfig
} from '@fastgpt/global/common/system/config/schema';
import { pruneDefaultOverrides } from '@fastgpt/global/common/system/config';
import { MongoSystemConfigs } from '@fastgpt/service/common/system/config/schema';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import { serviceEnv } from '@fastgpt/service/env';
import { appEnv } from '@/env';
import type { SystemMigrationLogger } from '@/migration/registry';

type LegacyFeConfigs = Record<string, any>;
type LegacySystemEnv = Record<string, any>;
type LegacyProConfig = Record<string, any>;
type DomainOverrides = Partial<Record<SystemInstanceConfigDomainKey, Record<string, unknown>>>;

const isNonEmpty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/** 仅保留非空字符串，避免把空值写成覆盖项。 */
const optionalText = (value: unknown): string | undefined =>
  isNonEmpty(value) ? value : undefined;

const optionalNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const optionalBool = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;

/** 将逗号或空白分隔的字符串转换为去重数组；空值返回 undefined 以跳过写入。 */
const splitList = (value: unknown): string[] | undefined => {
  if (!isNonEmpty(value)) return undefined;
  const list = value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return list.length > 0 ? list : undefined;
};

/** 移除对象中的 undefined 值；全部为空时返回 undefined，避免写入空覆盖块。 */
const compact = <T extends Record<string, unknown>>(input: T): T | undefined => {
  const result = Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  ) as T;
  return Object.keys(result).length > 0 ? result : undefined;
};

/** 深度移除 undefined，用于处理嵌套数组元素。 */
const compactDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    const list = value.map(compactDeep).filter((item) => item !== undefined);
    return list.length > 0 ? list : undefined;
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const next = compactDeep(item);
      if (next !== undefined) result[key] = next;
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }
  return value === undefined ? undefined : value;
};

/**
 * 构造各 Domain 的稀疏 overrides。
 * 优先级：旧数据库值 > 环境变量；两者都缺失时不写入（由 Schema 默认值兜底）。
 */
export const buildLegacyDomainOverrides = ({
  feConfigs,
  systemEnv
}: {
  feConfigs: LegacyFeConfigs;
  systemEnv: LegacySystemEnv;
}): DomainOverrides => {
  const overrides: DomainOverrides = {};

  // ---------- site ----------
  overrides.site = compact({
    name: optionalText(feConfigs.systemTitle) ?? optionalText(appEnv.SYSTEM_NAME),
    description: optionalText(appEnv.SYSTEM_DESCRIPTION),
    favicon: optionalText(feConfigs.favicon) ?? optionalText(appEnv.SYSTEM_FAVICON),
    marketplaceUrl: optionalText(appEnv.MARKETPLACE_URL),
    docUrl: optionalText(feConfigs.docUrl),
    openApiDocUrl: optionalText(feConfigs.openAPIDocUrl),
    openApiPrefix: optionalText(systemEnv.openapiPrefix),
    concatMd: optionalText(feConfigs.concatMd),
    appTemplateCourse: optionalText(feConfigs.appTemplateCourse),
    loginGuideDocUrl: optionalText(feConfigs.loginGuideDocUrl),
    navbarItems: Array.isArray(feConfigs.navbarItems)
      ? (compactDeep(feConfigs.navbarItems) as Record<string, unknown>[])
      : undefined
  }) as DomainOverrides['site'];

  // ---------- auth ----------
  overrides.auth = compact({
    openApiKeyMaxCount: optionalNumber(appEnv.OPENAPI_KEY_MAX_COUNT),
    passwordExpiredMonth: optionalNumber(appEnv.PASSWORD_EXPIRED_MONTH) ?? null,
    wecomLoginAutoRedirect: optionalBool(appEnv.WECOM_LOGIN_AUTO_REDIRECT),
    defaultTeamBasicPermissionsEnabled: optionalBool(
      serviceEnv.DEFAULT_TEAM_BASIC_PERMISSIONS_ENABLED
    )
  }) as DomainOverrides['auth'];

  // ---------- security ----------
  const legacyCensor = systemEnv.censor as LegacyFeConfigs | undefined;
  const legacyWorkflowHttpNode = systemEnv.workflowHttpNode as LegacyFeConfigs | undefined;
  overrides.security = compact({
    useIpLimit: optionalBool(serviceEnv.USE_IP_LIMIT),
    checkInternalIp: optionalBool(serviceEnv.CHECK_INTERNAL_IP),
    csrfEnabled: optionalBool(serviceEnv.CSRF_ENABLED),
    passwordLoginMinuteLimitCount: optionalNumber(serviceEnv.PASSWORD_LOGIN_MINUTE_LIMIT_COUNT),
    maxLoginSession: optionalNumber(serviceEnv.MAX_LOGIN_SESSION),
    allowedOrigins: splitList(serviceEnv.ALLOWED_ORIGINS),
    skipFileTypeCheck: optionalBool(serviceEnv.SKIP_FILE_TYPE_CHECK),
    censor: compact({
      baiduClientId: optionalText(legacyCensor?.BAIDU_TEXT_CENSOR_CLIENTID),
      baiduClientSecret: optionalText(legacyCensor?.BAIDU_TEXT_CENSOR_CLIENTSECRET),
      customCensorUrl: optionalText(legacyCensor?.customCensorURL)
    }),
    workflowHttpNode: compact({
      ignoreHttpsCertificate: optionalBool(legacyWorkflowHttpNode?.ignoreHttpsCertificate)
    }),
    fileUrlWhitelist: Array.isArray(systemEnv.fileUrlWhitelist)
      ? (systemEnv.fileUrlWhitelist as string[])
      : undefined
  }) as DomainOverrides['security'];

  // ---------- feature ----------
  overrides.feature = compact({
    hideChatCopyrightSetting: optionalBool(appEnv.HIDE_CHAT_COPYRIGHT_SETTING),
    multipleDataToBase64: optionalBool(serviceEnv.MULTIPLE_DATA_TO_BASE64),
    datasetSynonymEnabled: optionalBool(serviceEnv.DATASET_SYNONYM_ENABLED),
    agentEngine: optionalText(serviceEnv.AGENT_ENGINE),
    disableCache: optionalBool(serviceEnv.DISABLE_CACHE),
    enableTeamPluginUpload: optionalBool(feConfigs.enable_team_plugin_upload),
    showEmptyChat: optionalBool(feConfigs.show_emptyChat),
    showDatasetFeishu: optionalBool(feConfigs.show_dataset_feishu),
    showDatasetYuque: optionalBool(feConfigs.show_dataset_yuque),
    showDatasetDingtalk: optionalBool(feConfigs.show_dataset_dingtalk),
    showPublishFeishu: optionalBool(feConfigs.show_publish_feishu),
    showPublishDingtalk: optionalBool(feConfigs.show_publish_dingtalk),
    showPublishWecom: optionalBool(feConfigs.show_publish_wecom),
    showPublishOffiaccount: optionalBool(feConfigs.show_publish_offiaccount),
    showPublishWechat: optionalBool(feConfigs.show_publish_wechat),
    showComplianceCopywriting: optionalBool(feConfigs.show_compliance_copywriting)
  }) as DomainOverrides['feature'];

  // ---------- commercial ----------
  overrides.commercial = compact({
    showCoupon: optionalBool(appEnv.SHOW_COUPON),
    showDiscountCoupon: optionalBool(appEnv.SHOW_DISCOUNT_COUPON),
    payFormUrl: optionalText(appEnv.PAY_FORM_URL),
    agentSandboxFreeTip: optionalBool(appEnv.AGENT_SANDBOX_FREE_TIP)
  }) as DomainOverrides['commercial'];

  // ---------- resource ----------
  const legacyLimit = (feConfigs.limit ?? {}) as LegacyFeConfigs;
  overrides.resource = compact({
    serviceRequestMaxContentLength: optionalNumber(serviceEnv.SERVICE_REQUEST_MAX_CONTENT_LENGTH),
    systemMaxStringLengthM: optionalNumber(serviceEnv.SYSTEM_MAX_STRING_LENGTH_M),
    maxFolderDepth:
      optionalNumber(legacyLimit.maxFolderDepth) ?? optionalNumber(serviceEnv.MAX_FOLDER_DEPTH),
    appFolderMaxAmount: optionalNumber(serviceEnv.APP_FOLDER_MAX_AMOUNT),
    datasetFolderMaxAmount: optionalNumber(serviceEnv.DATASET_FOLDER_MAX_AMOUNT),
    uploadFileMaxSize:
      optionalNumber(feConfigs.uploadFileMaxSize) ??
      optionalNumber(serviceEnv.UPLOAD_FILE_MAX_SIZE),
    uploadFileMaxAmount:
      optionalNumber(feConfigs.uploadFileMaxAmount) ??
      optionalNumber(serviceEnv.UPLOAD_FILE_MAX_AMOUNT),
    exportDatasetLimitMinutes: optionalNumber(legacyLimit.exportDatasetLimitMinutes),
    websiteSyncLimitMinuted: optionalNumber(legacyLimit.websiteSyncLimitMinuted)
  }) as DomainOverrides['resource'];

  // ---------- performance ----------
  overrides.performance = compact({
    workflow: compact({
      maxRunTimes: optionalNumber(serviceEnv.WORKFLOW_MAX_RUN_TIMES),
      maxLoopTimes: optionalNumber(serviceEnv.WORKFLOW_MAX_LOOP_TIMES),
      parallelMaxConcurrency: optionalNumber(serviceEnv.WORKFLOW_PARALLEL_MAX_CONCURRENCY)
    }),
    parse: compact({
      fileTimeoutSeconds: optionalNumber(serviceEnv.PARSE_FILE_TIMEOUT_SECONDS),
      xlsxMaxRows: optionalNumber(serviceEnv.XLSX_PARSE_MAX_ROWS),
      xlsxMaxColumns: optionalNumber(serviceEnv.XLSX_PARSE_MAX_COLUMNS),
      xlsxMaxCells: optionalNumber(serviceEnv.XLSX_PARSE_MAX_CELLS),
      xlsxMaxMergedCells: optionalNumber(serviceEnv.XLSX_PARSE_MAX_MERGED_CELLS),
      maxHtmlTransformChars: optionalNumber(serviceEnv.MAX_HTML_TRANSFORM_CHARS)
    }),
    dataset: compact({
      parseMaxProcess:
        optionalNumber(systemEnv.datasetParseMaxProcess) ??
        optionalNumber(serviceEnv.DATASET_PARSE_MAX_PROCESS),
      vectorMaxProcess:
        optionalNumber(systemEnv.vectorMaxProcess) ?? optionalNumber(serviceEnv.VECTOR_MAX_PROCESS),
      qaMaxProcess:
        optionalNumber(systemEnv.qaMaxProcess) ?? optionalNumber(serviceEnv.QA_MAX_PROCESS),
      vlmMaxProcess:
        optionalNumber(systemEnv.vlmMaxProcess) ?? optionalNumber(serviceEnv.VLM_MAX_PROCESS),
      retrievalResultsLimit: optionalNumber(serviceEnv.RETRIEVAL_RESULTS_LIMIT)
    }),
    chat: compact({
      maxQpm: optionalNumber(serviceEnv.CHAT_MAX_QPM)
    }),
    streamResume: compact({
      ttlSeconds: optionalNumber(serviceEnv.STREAM_RESUME_TTL_SECONDS),
      postCompleteTtlSeconds: optionalNumber(serviceEnv.STREAM_RESUME_POST_COMPLETE_TTL_SECONDS),
      redisMaxmemoryRatio: optionalNumber(serviceEnv.STREAM_RESUME_REDIS_MAXMEMORY_RATIO),
      redisMemoryCheckIntervalMs: optionalNumber(
        serviceEnv.STREAM_RESUME_REDIS_MEMORY_CHECK_INTERVAL_MS
      )
    }),
    tracking: compact({
      batchUpdateTime: optionalNumber(serviceEnv.TRACK_BATCH_UPDATE_TIME),
      retentionHours: optionalNumber(serviceEnv.LLM_REQUEST_TRACKING_RETENTION_HOURS)
    }),
    task: compact({ evalConcurrency: optionalNumber(serviceEnv.EVAL_CONCURRENCY) }),
    channel: compact({ wechatConcurrency: optionalNumber(serviceEnv.WECHAT_CHANNEL_CONCURRENCY) })
  }) as DomainOverrides['performance'];

  // ---------- storage ----------
  overrides.storage = compact({
    downloadMode: optionalText(serviceEnv.STORAGE_DOWNLOAD_URL_MODE),
    externalEndpoint: optionalText(serviceEnv.STORAGE_EXTERNAL_ENDPOINT),
    cdnEndpoint: optionalText(serviceEnv.STORAGE_S3_CDN_ENDPOINT),
    fileUrlExpiredDays: optionalNumber(serviceEnv.FILE_URL_EXPIRED_DAYS)
  }) as DomainOverrides['storage'];

  // ---------- vector ----------
  overrides.vector = compact({
    hnswEfSearch:
      optionalNumber(systemEnv.hnswEfSearch) ?? optionalNumber(serviceEnv.HNSW_EF_SEARCH),
    hnswMaxScanTuples:
      optionalNumber(systemEnv.hnswMaxScanTuples) ?? optionalNumber(serviceEnv.HNSW_MAX_SCAN_TUPLES)
  }) as DomainOverrides['vector'];

  // ---------- providers ----------
  const legacyCustomPdf = (systemEnv.customPdfParse ?? {}) as LegacyFeConfigs;
  const isSangfor = serviceEnv.DOCUMENT_PARSE_PROVIDER === 'sangfor';
  // 深信服复用 CUSTOM_PDF_PARSE_URL/KEY 作为地址与 Bearer Token，迁移时同步写入 sangfor 域。
  const sangforUrl = isSangfor ? optionalText(serviceEnv.CUSTOM_PDF_PARSE_URL) : undefined;
  const sangforKey = isSangfor ? optionalText(serviceEnv.CUSTOM_PDF_PARSE_KEY) : undefined;

  overrides.providers = compact({
    documentParse: compact({
      provider: isSangfor ? 'sangfor' : undefined,
      customPdf: compact({
        url: optionalText(legacyCustomPdf.url) ?? optionalText(serviceEnv.CUSTOM_PDF_PARSE_URL),
        key: optionalText(legacyCustomPdf.key) ?? optionalText(serviceEnv.CUSTOM_PDF_PARSE_KEY),
        somarkApiKey: optionalText(serviceEnv.SOMARK_API_KEY),
        doc2xKey: optionalText(serviceEnv.DOC2X_KEY),
        textinAppId: optionalText(serviceEnv.TEXTIN_APP_ID),
        textinSecretCode: optionalText(serviceEnv.TEXTIN_SECRET_CODE)
      }),
      sangfor: compact({
        url: sangforUrl,
        key: sangforKey,
        extensions: optionalText(serviceEnv.SANGFOR_PARSE_EXTENSIONS),
        timeoutSeconds: optionalNumber(serviceEnv.SANGFOR_PARSE_TIMEOUT_SECONDS)
      })
    }),
    dataSource: compact({
      feishuBaseUrl: optionalText(serviceEnv.FEISHU_BASE_URL),
      dingtalkBaseUrl: optionalText(serviceEnv.DINGTALK_BASE_URL),
      dingtalkOapiBaseUrl: optionalText(serviceEnv.DINGTALK_OAPI_BASE_URL),
      yuqueDatasetBaseUrl: optionalText(serviceEnv.YUQUE_DATASET_BASE_URL)
    }),
    externalProviderWorkflowVariables: Array.isArray(feConfigs.externalProviderWorkflowVariables)
      ? (compactDeep(feConfigs.externalProviderWorkflowVariables) as Record<string, unknown>[])
      : undefined
  }) as DomainOverrides['providers'];

  // ---------- subservice ----------
  const pluginBaseUrl = optionalText(serviceEnv.PLUGIN_BASE_URL);
  const codeSandboxBaseUrl = optionalText(serviceEnv.CODE_SANDBOX_URL);
  const aiProxyEndpoint = optionalText(serviceEnv.AIPROXY_API_ENDPOINT);
  const agentSandboxProvider = optionalText(serviceEnv.AGENT_SANDBOX_PROVIDER);

  overrides.subservice = compact({
    plugin: compact({
      enabled: pluginBaseUrl ? true : undefined,
      baseUrl: pluginBaseUrl,
      token: optionalText(serviceEnv.PLUGIN_TOKEN)
    }),
    codeSandbox: compact({
      enabled: codeSandboxBaseUrl ? true : undefined,
      baseUrl: codeSandboxBaseUrl,
      token: optionalText(serviceEnv.CODE_SANDBOX_TOKEN)
    }),
    mcp: compact({
      enabled: appEnv.SSE_MCP_SERVER_PROXY_ENDPOINT ? true : undefined,
      sseProxyUrl: optionalText(appEnv.SSE_MCP_SERVER_PROXY_ENDPOINT)
    }),
    aiProxy: compact({
      enabled: aiProxyEndpoint ? true : undefined,
      endpoint: aiProxyEndpoint,
      token: optionalText(serviceEnv.AIPROXY_API_TOKEN)
    }),
    agentSandbox: compact({
      provider: agentSandboxProvider,
      common: compact({
        cpuCount: optionalNumber(serviceEnv.AGENT_SANDBOX_CPU_COUNT),
        memoryMiB: optionalNumber(serviceEnv.AGENT_SANDBOX_MEMORY_MIB),
        storageSizeGi: optionalNumber(serviceEnv.AGENT_SANDBOX_STORAGE_SIZE_GI),
        suspendMinutes: optionalNumber(serviceEnv.AGENT_SANDBOX_SUSPEND_MINUTES),
        archiveInactiveDays: optionalNumber(serviceEnv.AGENT_SANDBOX_ARCHIVE_INACTIVE_DAYS),
        maxEditDebug: optionalNumber(serviceEnv.AGENT_SANDBOX_MAX_EDIT_DEBUG),
        entrypointTimeoutSeconds: optionalNumber(
          serviceEnv.AGENT_SANDBOX_ENTRYPOINT_TIMEOUT_SECONDS
        ),
        wsMaxMessageBytes: optionalNumber(serviceEnv.AGENT_SANDBOX_WS_MAX_MESSAGE_BYTES),
        wsMaxFrameBytes: optionalNumber(serviceEnv.AGENT_SANDBOX_WS_MAX_FRAME_BYTES),
        npmRegistry: optionalText(serviceEnv.AGENT_SANDBOX_NPM_REGISTRY),
        pypiIndexUrl: optionalText(serviceEnv.AGENT_SANDBOX_PYPI_INDEX_URL),
        aptMirror: optionalText(serviceEnv.AGENT_SANDBOX_APT_MIRROR)
      }),
      sealosdevbox: compact({
        baseUrl: optionalText(serviceEnv.AGENT_SANDBOX_SEALOS_BASEURL),
        token: optionalText(serviceEnv.AGENT_SANDBOX_SEALOS_TOKEN),
        workDirectory: optionalText(serviceEnv.AGENT_SANDBOX_SEALOS_WORK_DIRECTORY),
        image: optionalText(serviceEnv.AGENT_SANDBOX_SEALOS_IMAGE)
      }),
      opensandbox: compact({
        baseUrl: optionalText(serviceEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL),
        apiKey: optionalText(serviceEnv.AGENT_SANDBOX_OPENSANDBOX_API_KEY),
        runtime: optionalText(serviceEnv.AGENT_SANDBOX_OPENSANDBOX_RUNTIME),
        image: optionalText(serviceEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE),
        useServerProxy: optionalBool(serviceEnv.AGENT_SANDBOX_OPENSANDBOX_USE_SERVER_PROXY),
        volumeManagerUrl: optionalText(serviceEnv.AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL),
        volumeManagerToken: optionalText(serviceEnv.AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_TOKEN),
        volumeNamePrefix: optionalText(serviceEnv.AGENT_SANDBOX_OPENSANDBOX_VOLUME_NAME_PREFIX)
      }),
      proxy: compact({
        wsUrl: optionalText(serviceEnv.AGENT_SANDBOX_PROXY_URL),
        httpUrl: optionalText(serviceEnv.AGENT_SANDBOX_PREVIEW_PROXY_URL)
      })
    })
  }) as DomainOverrides['subservice'];

  return overrides;
};

/**
 * 生成「相对 Schema 默认值」的稀疏 overrides。
 * 与环境变量默认值相同的项被剪枝，避免把当前默认值固化成覆盖项，
 * 使后续版本调整默认值时老实例也能自动跟随。
 */
export const buildSparseLegacyOverrides = ({
  feConfigs,
  systemEnv,
  proConfig
}: {
  feConfigs: LegacyFeConfigs;
  systemEnv: LegacySystemEnv;
  proConfig?: LegacyProConfig;
}): DomainOverrides => {
  const raw = buildLegacyDomainOverrides({ feConfigs, systemEnv });
  const pro = buildLegacyProOverrides(proConfig ?? {});

  // 商业版字段与主站字段合并到同一份 overrides，deepMerge 语义下逐字段合并
  const merged: DomainOverrides = { ...raw };
  for (const domain of SYSTEM_INSTANCE_CONFIG_DOMAINS) {
    const proOverrides = pro[domain];
    if (!proOverrides) continue;
    merged[domain] = { ...(merged[domain] ?? {}), ...proOverrides };
  }

  const sparse: DomainOverrides = {};

  for (const domain of SYSTEM_INSTANCE_CONFIG_DOMAINS) {
    const domainOverrides = merged[domain];
    if (!domainOverrides) continue;

    const pruned = pruneDefaultOverrides(domainOverrides, getDomainDefaultConfig(domain));
    if (pruned) {
      sparse[domain] = pruned;
    }
  }

  return sparse;
};

/**
 * 将旧 fastgptPro 配置（登录提供商与支付凭据）映射为新 Domain overrides。
 * pro 侧当前仅剩 API 与持久化层，本函数为其改造提供数据迁移基础。
 */
export const buildLegacyProOverrides = (pro: LegacyProConfig): DomainOverrides => {
  const auth = (pro.auth ?? {}) as LegacyProConfig;
  const pay = (pro.pay ?? {}) as LegacyProConfig;
  const sms = (auth.sms ?? {}) as LegacyProConfig;
  const email = (auth.email ?? {}) as LegacyProConfig;
  const phone = (auth.phone ?? {}) as LegacyProConfig;
  const wechat = (auth.wechat ?? {}) as LegacyProConfig;
  const wecom = (auth.wecom ?? {}) as LegacyProConfig;
  const github = (auth.github ?? {}) as LegacyProConfig;
  const google = (auth.google ?? {}) as LegacyProConfig;
  const microsoft = (auth.microsoft ?? {}) as LegacyProConfig;
  const dingtalk = (auth.dingtalk ?? {}) as LegacyProConfig;
  const cancellation = (pro.accountCancellation ?? {}) as LegacyProConfig;

  /** 短信模板已只保留中文：英文模板仅在中文缺失时作为兜底来源。 */
  const pair = (zh?: unknown, en?: unknown) => {
    const zhText = optionalText(zh) ?? optionalText(en);
    if (!zhText) return undefined;
    return { zh: zhText };
  };

  const overrides: DomainOverrides = {};

  overrides.auth = compact({
    teamMode: optionalText(pro.teamMode),
    loginProviders: compact({
      email: compact({
        smtp: optionalText(email.smtp),
        user: optionalText(email.user),
        pass: optionalText(email.pass),
        port: optionalNumber(email.port),
        secure: optionalBool(email.secure),
        register: optionalBool(email.register)
      }),
      sms: compact({
        login: pair(sms.LOGIN, sms.LOGIN_EN),
        register: pair(sms.REGISTER, sms.REGISTER_EN),
        resetPassword: pair(sms.RESET_PASSWORD, sms.RESET_PASSWORD_EN),
        changePassword: pair(sms.CHANGE_PASSWORD, sms.CHANGE_PASSWORD_EN),
        bindNotification: pair(sms.BIND_NOTIFICATION, sms.BIND_NOTIFICATION_EN)
      }),
      phone: compact({
        accessKeyId: optionalText(phone.SNED_PHONE_ACCESSKEYID),
        accessKeySecret: optionalText(phone.SNED_PHONE_ACCESSSECRET),
        signName: optionalText(phone.SNED_PHONE_SIGNNAME)
      }),
      wechat: compact({
        appId: optionalText(wechat.appID),
        appSecret: optionalText(wechat.appSecret)
      }),
      wecom: compact({
        suiteId: optionalText(wecom.suiteId),
        secret: optionalText(wecom.secret),
        token: optionalText(wecom.token),
        encodingAESKey: optionalText(wecom.encodingAESKey),
        corpId: optionalText(wecom.cropId),
        providerSecret: optionalText(wecom.providerSecret),
        buyerUserId: optionalText(wecom.buyerUserId),
        basicVersionId: optionalText(wecom.basicVersionId),
        advancedVersionId: optionalText(wecom.advancedVersionId),
        paySecret: optionalText(wecom.paySecret)
      }),
      github: compact({
        clientId: optionalText(github.clientId),
        secret: optionalText(github.secret)
      }),
      google: compact({
        clientId: optionalText(google.clientId),
        secret: optionalText(google.secret)
      }),
      microsoft: compact({
        clientId: optionalText(microsoft.clientId),
        secret: optionalText(microsoft.secret),
        tenantId: optionalText(microsoft.tenantId),
        customButton: optionalText(microsoft.customButton)
      }),
      dingtalk: compact({
        clientId: optionalText(dingtalk.clientId),
        secret: optionalText(dingtalk.secret)
      })
    }),
    fastLogin: Array.isArray(pro.fastLogin)
      ? (compactDeep(pro.fastLogin) as Record<string, unknown>[])
      : undefined,
    accountCancellation: compact({
      enabled: optionalBool(cancellation.enabled),
      cancellationSm: pair(sms.ACCOUNT_CANCELLATION, sms.ACCOUNT_CANCELLATION_EN),
      reminderSm: pair(sms.ACCOUNT_CANCELLATION_REMINDER, sms.ACCOUNT_CANCELLATION_REMINDER_EN),
      todaySm: pair(sms.ACCOUNT_CANCELLATION_TODAY, sms.ACCOUNT_CANCELLATION_TODAY_EN)
    })
  }) as DomainOverrides['auth'];

  const wx = (pay.wx ?? {}) as LegacyProConfig;
  const alipay = (pay.alipay ?? {}) as LegacyProConfig;
  const bank = (pay.bank ?? {}) as LegacyProConfig;

  overrides.commercial = compact({
    payment: compact({
      wx: compact({
        appId: optionalText(wx.WX_APPID),
        mchId: optionalText(wx.WX_MCHID),
        serialNo: optionalText(wx.WX_SERIAL_NO),
        apiV3Key: optionalText(wx.WX_V3_CODE),
        notifyUrl: optionalText(wx.WX_NOTIFY_URL),
        privateKey: optionalText(wx.WX_PRIVATE_KEY)
      }),
      alipay: compact({
        appId: optionalText(alipay.APP_ID),
        appPrivateKey: optionalText(alipay.APP_PRIVATE_KEY),
        appCertContent: optionalText(alipay.APP_CERT_CONTENT),
        gateway: optionalText(alipay.ALIPAY_GATEWAY),
        rootCertContent: optionalText(alipay.ALIPAY_ROOT_CERT_CONTENT),
        publicCertContent: optionalText(alipay.ALIPAY_PUBLIC_CERT_CONTENT),
        endpoint: optionalText(alipay.ALIPAY_ENDPOINT),
        notifyUrl: optionalText(alipay.ALIPAY_NOTIFY_URL)
      }),
      bank: compact({ description: optionalText(bank.description) })
    }),
    billingNotify: compact({
      paymentReceived: undefined,
      lackOfPoints: pair(sms.LACK_OF_POINTS, sms.LACK_OF_POINTS_EN),
      pointsTenPercentRemain: pair(sms.POINTS_TEN_PERCENT_REMAIN, sms.POINTS_TEN_PERCENT_REMAIN_EN),
      expireSoon: pair(sms.EXPIRE_SOON, sms.EXPIRE_SOON_EN),
      expired: pair(sms.EXPIRED, sms.EXPIRED_EN)
    })
  }) as DomainOverrides['commercial'];

  return overrides;
};

/**
 * 检测已改由环境变量承载、但旧库仍有值的历史字段。
 * customApiDomain / customSharePageDomain / scripts 需要部署者手动补入 ENV，
 * 迁移阶段无法自动搬运（涉及 DNS、证书与安全边界），因此只输出告警。
 * show_git 同样改由环境变量承载：旧库显式关闭（false）时提示补入 SHOW_GIT=false。
 */
export const collectEnvRehomedWarnings = ({
  feConfigs
}: {
  feConfigs: LegacyFeConfigs;
}): string[] => {
  const warnings: string[] = [];

  if (isNonEmpty(feConfigs.customApiDomain)) {
    warnings.push('customApiDomain -> 请配置环境变量 CUSTOM_API_DOMAIN');
  }
  if (isNonEmpty(feConfigs.customSharePageDomain)) {
    warnings.push('customSharePageDomain -> 请配置环境变量 CUSTOM_SHARE_PAGE_DOMAIN');
  }
  if (Array.isArray(feConfigs.scripts) && feConfigs.scripts.length > 0) {
    warnings.push('scripts -> 请配置环境变量 SCRIPTS（JSON 字符串）');
  }
  // show_git 改由环境变量承载：旧库显式关闭过时需要部署者补入 ENV，否则升级后默认开启
  if (feConfigs.show_git === false) {
    warnings.push('show_git=false -> 请配置环境变量 SHOW_GIT=false');
  }
  if (isNonEmpty(feConfigs.ip_whitelist)) {
    warnings.push('ip_whitelist 已废弃，旧值将被忽略');
  }

  return warnings;
};

/**
 * 读取旧配置来源并生成迁移计划。
 * 幂等判定按域进行：对比迁移目标 Domain 与已有文档，统计缺失数量。
 * 不能只看 count>0，否则部分写入失败后重跑会把残缺状态误判为已完成，
 * 缺失 Domain 将永久回落到 Schema 默认值（配置被静默重置）。
 */
export const inspectInstanceConfigMigration = async () => {
  const [existingDocs, legacyFastgpt, legacyPro] = await Promise.all([
    MongoSystemInstanceConfig.find({}, { _id: 1 }).lean(),
    MongoSystemConfigs.findOne({ type: SystemConfigsTypeEnum.fastgpt })
      .sort({ createTime: -1 })
      .lean(),
    MongoSystemConfigs.findOne({ type: SystemConfigsTypeEnum.fastgptPro })
      .sort({ createTime: -1 })
      .lean()
  ]);

  const feConfigs = (legacyFastgpt?.value?.feConfigs ?? {}) as LegacyFeConfigs;
  const systemEnv = (legacyFastgpt?.value?.systemEnv ?? {}) as LegacySystemEnv;
  const proConfig = (legacyPro?.value ?? {}) as LegacyProConfig;

  const overrides = buildSparseLegacyOverrides({ feConfigs, systemEnv, proConfig });
  const existingDomains = new Set<string>(existingDocs.map((doc) => String(doc._id)));
  const missingDomainCount = SYSTEM_INSTANCE_CONFIG_DOMAINS.filter(
    (domain) => !!overrides[domain] && !existingDomains.has(domain)
  ).length;

  return {
    existingDomainCount: existingDocs.length,
    missingDomainCount,
    hasLegacyConfig: !!legacyFastgpt || !!legacyPro,
    hasLegacyProConfig: !!legacyPro,
    envRehomedWarnings: collectEnvRehomedWarnings({ feConfigs }),
    overrides
  };
};

/**
 * 按域幂等写入 Domain 文档：$setOnInsert 只补写缺失的 Domain，
 * 已存在的文档（可能被管理员修改过）绝不覆盖，失败后重跑可继续补齐。
 */
export const applyInstanceConfigMigration = async ({
  overrides,
  logger
}: {
  overrides: DomainOverrides;
  logger: SystemMigrationLogger;
}) => {
  const domains = SYSTEM_INSTANCE_CONFIG_DOMAINS.filter((domain) => !!overrides[domain]);
  const migratedDomains: SystemInstanceConfigDomainKey[] = [];

  for (const domain of domains) {
    const rawOverrides = overrides[domain]!;
    // 先执行两阶段校验，确保写入值与运行时解析结果一致（与 controller 写入路径一致，
    // updateOne 不跑 schema validator，由这里显式校验兜底）。
    resolveDomainEffectiveConfig(domain, rawOverrides);

    const result = await MongoSystemInstanceConfig.updateOne(
      { _id: domain },
      {
        $setOnInsert: {
          schemaVersion: SYSTEM_INSTANCE_CONFIG_SCHEMA_VERSION,
          revision: 1,
          overrides: rawOverrides,
          updatedBy: { actor: 'migration' }
        }
      },
      { upsert: true, runValidators: false }
    );
    // 仅统计真正新建的 Domain，已存在被跳过的不计入迁移结果
    if (result.upsertedCount > 0) {
      migratedDomains.push(domain);
    }
  }

  logger.info('Instance config migration applied', { domains: migratedDomains });
  return { domains: migratedDomains, migratedCount: migratedDomains.length };
};
