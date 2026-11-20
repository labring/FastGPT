import {
  hasDamagedSecurityOverrides,
  LegacyBooleanSchema,
  readMigrationDomainConfig
} from './validation';
import { readLegacyInstanceConfigEnv } from './env';
import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
import { NumSchema } from '@fastgpt/global/common/zod';
import {
  SYSTEM_INSTANCE_CONFIG_SCHEMA_VERSION,
  SYSTEM_INSTANCE_CONFIG_DOMAINS,
  type SystemInstanceConfigDomainKey,
  getDomainDefaultConfig,
  systemInstanceConfigDomainSchemaMap
} from '@fastgpt/global/common/system/config/schema';
import { AgentSandboxProxyConfigSchema } from '@fastgpt/global/common/system/config/schemas/subservice';
import {
  collectPrunedLeafPaths,
  deepMergeConfig,
  hasOverridePath,
  pruneDefaultOverrides
} from '@fastgpt/global/common/system/config/merge';
import { MongoSystemConfigs } from '@fastgpt/service/common/system/config/schema';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import {
  decryptDomainSecrets,
  encryptDomainSecrets
} from '@fastgpt/service/common/system/systemInstanceConfig/secrets';
import { logInstanceConfigRead } from '@fastgpt/service/common/system/migrationCoverageLog';
import type { SystemMigrationLogger } from '@/migration/registry';
import {
  initializeEmptyInstanceConfig,
  readDefaultInstanceConfig,
  type DefaultConfigInitialization
} from './defaultConfig';
import { agentSandboxProxyEnvKeys } from './subservices';

type LegacyFeConfigs = Record<string, any>;
type LegacySystemEnv = Record<string, any>;
type LegacyProConfig = Record<string, any>;
type DomainOverrides = Partial<Record<SystemInstanceConfigDomainKey, Record<string, unknown>>>;
type DomainExplicitDefaultPaths = Partial<Record<SystemInstanceConfigDomainKey, string[]>>;

/** 迁移时发现的配置告警；保留原值，只记录路径。 */
export type SchemaSanitizedIssue = {
  domain: SystemInstanceConfigDomainKey;
  /** 具体字段相对路径；undefined 表示域本身的结构不符合保存约束。 */
  path?: string;
};

const isNonEmpty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/** 空白文本沿用旧版未配置语义；其他历史值原样保留，交由保存校验提示管理员修复。 */
const optionalText = (value: unknown): string | undefined =>
  value === undefined || (typeof value === 'string' && !value.trim())
    ? undefined
    : (value as string);

/** 保留显式空串：旧配置中的清空操作不能被迁移成新 Schema 的非空默认值。 */
const optionalString = (value: unknown): string | undefined =>
  value === undefined ? undefined : (value as string);

/** 兼容数字字符串；未配置值跳过，其他无法解析的历史值保留，避免迁移丢失配置。 */
const optionalNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim()))
    return undefined;
  if (typeof value !== 'number' && typeof value !== 'string') return value as number;
  const result = NumSchema.safeParse(value);
  return result.success ? result.data : (value as number);
};

/** 迁移接受明确的旧布尔编码，例如数字 0/1，其他已配置值保留供修复。 */
const optionalBool = (value: unknown): boolean | undefined => {
  if (value === undefined) return undefined;
  const result = LegacyBooleanSchema.safeParse(value);
  return result.success ? result.data : (value as boolean);
};

/**
 * 解析一组 url/key 凭据：旧库任一字段存在时整组采用旧库。
 * 两个字段分别回落可能拼出跨来源组合（旧库地址 + 环境变量密钥），
 * 把一方的凭据发给另一方服务。
 */
const resolveCredentialGroup = ({
  legacy,
  env
}: {
  legacy: { url?: string; key?: string };
  env: { url?: string; key?: string };
}): { url?: string; key?: string } => (legacy.url || legacy.key ? legacy : env);

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
  systemEnv,
  legacyEnv = readLegacyInstanceConfigEnv()
}: {
  feConfigs: LegacyFeConfigs;
  systemEnv: LegacySystemEnv;
  legacyEnv?: ReturnType<typeof readLegacyInstanceConfigEnv>;
}): DomainOverrides => {
  const overrides: DomainOverrides = {};

  // ---------- site ----------
  overrides.site = compact({
    publicUrl: optionalText(legacyEnv.FE_DOMAIN),
    name: optionalText(feConfigs.systemTitle) ?? optionalText(legacyEnv.SYSTEM_NAME),
    description: optionalText(legacyEnv.SYSTEM_DESCRIPTION),
    favicon: optionalText(feConfigs.favicon) ?? optionalText(legacyEnv.SYSTEM_FAVICON),
    docUrl: optionalString(feConfigs.docUrl),
    openApiPrefix: optionalText(systemEnv.openapiPrefix),
    concatMd: optionalString(feConfigs.concatMd),
    appTemplateCourse: optionalString(feConfigs.appTemplateCourse),
    loginGuideDocUrl: optionalString(feConfigs.loginGuideDocUrl),
    customApiDomain:
      optionalText(feConfigs.customApiDomain) ?? optionalText(legacyEnv.CUSTOM_API_DOMAIN),
    customSharePageDomain:
      optionalText(feConfigs.customSharePageDomain) ??
      optionalText(legacyEnv.CUSTOM_SHARE_PAGE_DOMAIN),
    customDomain: compact({
      enable: optionalBool(feConfigs.customDomain?.enable),
      domain: compact({
        aliyun: optionalText(feConfigs.customDomain?.domain?.aliyun),
        tencent: optionalText(feConfigs.customDomain?.domain?.tencent),
        volcengine: optionalText(feConfigs.customDomain?.domain?.volcengine)
      }),
      kc: compact({
        aliyun: optionalString(systemEnv.customDomain?.kc?.aliyun),
        tencent: optionalString(systemEnv.customDomain?.kc?.tencent),
        volcengine: optionalString(systemEnv.customDomain?.kc?.volcengine)
      }),
      issuerServiceName: compact({
        aliyun: optionalString(systemEnv.customDomain?.issuerServiceName?.aliyun),
        tencent: optionalString(systemEnv.customDomain?.issuerServiceName?.tencent),
        volcengine: optionalString(systemEnv.customDomain?.issuerServiceName?.volcengine)
      }),
      nginxServiceName: compact({
        aliyun: optionalString(systemEnv.customDomain?.nginxServiceName?.aliyun),
        tencent: optionalString(systemEnv.customDomain?.nginxServiceName?.tencent),
        volcengine: optionalString(systemEnv.customDomain?.nginxServiceName?.volcengine)
      })
    }),
    botIframeUrl: optionalString(feConfigs.botIframeUrl),
    scripts:
      Array.isArray(feConfigs.scripts) && feConfigs.scripts.length > 0
        ? (compactDeep(feConfigs.scripts) as Record<string, string>[])
        : (() => {
            const fromEnv = (() => {
              if (!legacyEnv.SCRIPTS) return [];
              try {
                const parsed = JSON.parse(legacyEnv.SCRIPTS);
                return Array.isArray(parsed)
                  ? parsed.filter(
                      (item): item is Record<string, string> =>
                        typeof item === 'object' && item !== null && !Array.isArray(item)
                    )
                  : [];
              } catch {
                return [];
              }
            })();
            return fromEnv.length > 0 ? fromEnv : undefined;
          })(),
    navbarItems: Array.isArray(feConfigs.navbarItems)
      ? (compactDeep(feConfigs.navbarItems) as Record<string, unknown>[])
      : undefined
  }) as DomainOverrides['site'];

  // ---------- auth ----------
  overrides.auth = compact({
    openApiKeyMaxCount: optionalNumber(legacyEnv.OPENAPI_KEY_MAX_COUNT),
    passwordExpiredMonth: optionalNumber(legacyEnv.PASSWORD_EXPIRED_MONTH) ?? null,
    sso: compact({
      title: optionalString(feConfigs.sso?.title),
      icon: optionalString(feConfigs.sso?.icon),
      autoLogin: optionalBool(feConfigs.sso?.autoLogin),
      disablePasswordForSsoUsers: optionalBool(feConfigs.sso?.disablePasswordForSsoUsers)
    })
  }) as DomainOverrides['auth'];

  // ---------- security ----------
  const legacyWorkflowHttpNode = systemEnv.workflowHttpNode as LegacyFeConfigs | undefined;
  overrides.security = compact({
    checkInternalIp: optionalBool(legacyEnv.CHECK_INTERNAL_IP),
    csrfEnabled: optionalBool(legacyEnv.CSRF_ENABLED),
    passwordLoginMinuteLimitCount: optionalNumber(legacyEnv.PASSWORD_LOGIN_MINUTE_LIMIT_COUNT),
    maxLoginSession: optionalNumber(legacyEnv.MAX_LOGIN_SESSION),
    allowedOrigins: splitList(legacyEnv.ALLOWED_ORIGINS),
    skipFileTypeCheck: optionalBool(legacyEnv.SKIP_FILE_TYPE_CHECK),
    // 旧版只在名单非空时执行限制；显式开关优先。初始迁移同时写开关，
    // 避免 11 域已齐全但 backfill 尚未执行时 Pro 把缺失值解析成默认 false。
    checkExternalFile:
      systemEnv.checkExternalFile !== undefined
        ? optionalBool(systemEnv.checkExternalFile)
        : Array.isArray(systemEnv.fileUrlWhitelist)
          ? systemEnv.fileUrlWhitelist.length > 0
          : undefined,
    workflowHttpNode: compact({
      ignoreHttpsCertificate: optionalBool(legacyWorkflowHttpNode?.ignoreHttpsCertificate)
    }),
    fileUrlWhitelist: Array.isArray(systemEnv.fileUrlWhitelist)
      ? (systemEnv.fileUrlWhitelist as string[])
      : undefined
  }) as DomainOverrides['security'];

  // ---------- feature ----------
  overrides.feature = compact({
    hideChatCopyrightSetting: optionalBool(legacyEnv.HIDE_CHAT_COPYRIGHT_SETTING),
    multipleDataToBase64: optionalBool(legacyEnv.MULTIPLE_DATA_TO_BASE64),
    agentEngine: optionalText(legacyEnv.AGENT_ENGINE),
    enableTeamPluginUpload: optionalBool(feConfigs.enable_team_plugin_upload),
    showOpenaiAccount: optionalBool(feConfigs.show_openai_account),
    enableTeamModel: optionalBool(feConfigs.enable_team_model),
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
  // 沙箱免费提示（AGENT_SANDBOX_SHOW_FREE_TIP）不迁移：该开关仍以 ENV 为权威，实例配置无消费点。
  overrides.commercial = compact({
    showCoupon: optionalBool(legacyEnv.SHOW_COUPON),
    showDiscountCoupon: optionalBool(legacyEnv.SHOW_DISCOUNT_COUPON),
    payFormUrl: optionalText(legacyEnv.PAY_FORM_URL)
  }) as DomainOverrides['commercial'];

  // ---------- resource ----------
  const legacyLimit = (feConfigs.limit ?? {}) as LegacyFeConfigs;
  overrides.resource = compact({
    serviceRequestMaxContentLength: optionalNumber(legacyEnv.SERVICE_REQUEST_MAX_CONTENT_LENGTH),
    systemMaxStringLengthM: optionalNumber(legacyEnv.SYSTEM_MAX_STRING_LENGTH_M),
    maxFolderDepth:
      optionalNumber(legacyLimit.maxFolderDepth) ?? optionalNumber(legacyEnv.MAX_FOLDER_DEPTH),
    appFolderMaxAmount: optionalNumber(legacyEnv.APP_FOLDER_MAX_AMOUNT),
    datasetFolderMaxAmount: optionalNumber(legacyEnv.DATASET_FOLDER_MAX_AMOUNT),
    uploadFileMaxSize:
      optionalNumber(legacyLimit.uploadFileMaxSize) ??
      optionalNumber(feConfigs.uploadFileMaxSize) ??
      optionalNumber(legacyEnv.UPLOAD_FILE_MAX_SIZE),
    uploadFileMaxAmount:
      optionalNumber(legacyLimit.uploadFileMaxAmount) ??
      optionalNumber(feConfigs.uploadFileMaxAmount) ??
      optionalNumber(legacyEnv.UPLOAD_FILE_MAX_AMOUNT),
    datasetArchive: compact({
      maxFiles: optionalNumber(legacyEnv.DATASET_ARCHIVE_MAX_FILES),
      maxSourceSizeMiB: optionalNumber(legacyEnv.DATASET_ARCHIVE_MAX_SOURCE_SIZE_MB),
      maxConcurrency: optionalNumber(legacyEnv.DATASET_ARCHIVE_MAX_CONCURRENCY),
      prepareTimeoutSeconds: optionalNumber(legacyEnv.DATASET_ARCHIVE_PREPARE_TIMEOUT_SECONDS)
    }),
    exportDatasetLimitMinutes: optionalNumber(legacyLimit.exportDatasetLimitMinutes),
    websiteSyncLimitMinuted: optionalNumber(legacyLimit.websiteSyncLimitMinuted)
  }) as DomainOverrides['resource'];

  // ---------- performance ----------
  overrides.performance = compact({
    workflow: compact({
      maxRunTimes: optionalNumber(legacyEnv.WORKFLOW_MAX_RUN_TIMES),
      maxLoopTimes: optionalNumber(legacyEnv.WORKFLOW_MAX_LOOP_TIMES),
      parallelMaxConcurrency:
        optionalNumber(legacyLimit.workflowParallelRunMaxConcurrency) ??
        optionalNumber(legacyEnv.WORKFLOW_PARALLEL_MAX_CONCURRENCY)
    }),
    parse: compact({
      fileTimeoutSeconds: optionalNumber(legacyEnv.PARSE_FILE_TIMEOUT_SECONDS),
      xlsxMaxRows: optionalNumber(legacyEnv.XLSX_PARSE_MAX_ROWS),
      xlsxMaxColumns: optionalNumber(legacyEnv.XLSX_PARSE_MAX_COLUMNS),
      xlsxMaxCells: optionalNumber(legacyEnv.XLSX_PARSE_MAX_CELLS),
      xlsxMaxMergedCells: optionalNumber(legacyEnv.XLSX_PARSE_MAX_MERGED_CELLS),
      maxHtmlTransformChars: optionalNumber(legacyEnv.MAX_HTML_TRANSFORM_CHARS)
    }),
    dataset: compact({
      parseMaxProcess:
        optionalNumber(systemEnv.datasetParseMaxProcess) ??
        optionalNumber(legacyEnv.DATASET_PARSE_MAX_PROCESS),
      vectorMaxProcess:
        optionalNumber(systemEnv.vectorMaxProcess) ?? optionalNumber(legacyEnv.VECTOR_MAX_PROCESS),
      qaMaxProcess:
        optionalNumber(systemEnv.qaMaxProcess) ?? optionalNumber(legacyEnv.QA_MAX_PROCESS),
      vlmMaxProcess:
        optionalNumber(systemEnv.vlmMaxProcess) ?? optionalNumber(legacyEnv.VLM_MAX_PROCESS)
    }),
    chat: compact({
      maxQpm: optionalNumber(legacyEnv.CHAT_MAX_QPM)
    }),
    tracking: compact({
      retentionHours: optionalNumber(legacyEnv.LLM_REQUEST_TRACKING_RETENTION_HOURS)
    })
  }) as DomainOverrides['performance'];

  // ---------- storage ----------
  overrides.storage = compact({
    downloadMode: optionalText(legacyEnv.STORAGE_DOWNLOAD_URL_MODE),
    externalEndpoint: optionalText(legacyEnv.STORAGE_EXTERNAL_ENDPOINT),
    cdnEndpoint: optionalText(legacyEnv.STORAGE_S3_CDN_ENDPOINT),
    fileUrlExpiredDays: optionalNumber(legacyEnv.FILE_URL_EXPIRED_DAYS)
  }) as DomainOverrides['storage'];

  // ---------- vector ----------
  overrides.vector = compact({
    hnswEfSearch:
      optionalNumber(systemEnv.hnswEfSearch) ?? optionalNumber(legacyEnv.HNSW_EF_SEARCH),
    vectorRecallConcurrency: optionalNumber(systemEnv.vectorRecallConcurrency)
  }) as DomainOverrides['vector'];

  // ---------- providers ----------
  const legacyCustomPdf = (systemEnv.customPdfParse ?? {}) as LegacyFeConfigs;
  const isSangfor = legacyEnv.DOCUMENT_PARSE_PROVIDER === 'sangfor';
  // 深信服复用 CUSTOM_PDF_PARSE_URL/KEY 作为地址与 Bearer Token。
  // 旧库优先：远程解析凭据历史上同时保存在 systemEnv.customPdfParse 和环境变量中，
  // 迁移时必须从同一来源成组取值，再同步写入 customPdf 与 sangfor 两个逻辑块。
  const legacyPdfCredentials = {
    url: optionalText(legacyCustomPdf.url),
    key: optionalText(legacyCustomPdf.key)
  };
  const envPdfCredentials = {
    url: optionalText(legacyEnv.CUSTOM_PDF_PARSE_URL),
    key: optionalText(legacyEnv.CUSTOM_PDF_PARSE_KEY)
  };
  const customPdfCredentials = resolveCredentialGroup({
    legacy: legacyPdfCredentials,
    env: envPdfCredentials
  });
  const customPdf = {
    url: customPdfCredentials.url,
    key: customPdfCredentials.key,
    somarkApiKey:
      optionalText(legacyCustomPdf.somarkApiKey) ?? optionalText(legacyEnv.SOMARK_API_KEY),
    doc2xKey: optionalText(legacyCustomPdf.doc2xKey) ?? optionalText(legacyEnv.DOC2X_KEY),
    textinAppId: optionalText(legacyCustomPdf.textinAppId) ?? optionalText(legacyEnv.TEXTIN_APP_ID),
    textinSecretCode:
      optionalText(legacyCustomPdf.textinSecretCode) ?? optionalText(legacyEnv.TEXTIN_SECRET_CODE),
    price: optionalNumber(legacyCustomPdf.price)
  };
  const sangforCredentials = isSangfor
    ? resolveCredentialGroup({ legacy: legacyPdfCredentials, env: envPdfCredentials })
    : { url: undefined, key: undefined };

  // 旧运行时没有 provider 选择，按 custom → somark → textin → doc2x 的固定顺序选择第一个
  // 可用凭据。迁移时把这一实际选择固化为 provider，运行期改为按 provider 分派，
  // 避免管理员切换后仍被旧凭据抢占。
  const documentParseProvider = (() => {
    if (isSangfor && sangforCredentials.url) return 'sangfor' as const;
    if (customPdf.url) return 'customPdf' as const;
    if (customPdf.somarkApiKey) return 'somark' as const;
    if (customPdf.textinAppId && customPdf.textinSecretCode) return 'textin' as const;
    if (customPdf.doc2xKey) return 'doc2x' as const;
    return undefined;
  })();

  overrides.providers = compact({
    documentParse: compact({
      provider: documentParseProvider,
      customPdf: compact(customPdf),
      sangfor: compact({
        url: sangforCredentials.url,
        key: sangforCredentials.key,
        extensions: optionalText(legacyEnv.SANGFOR_PARSE_EXTENSIONS),
        timeoutSeconds: optionalNumber(legacyEnv.SANGFOR_PARSE_TIMEOUT_SECONDS)
      })
    }),
    externalProviderWorkflowVariables: Array.isArray(feConfigs.externalProviderWorkflowVariables)
      ? (compactDeep(feConfigs.externalProviderWorkflowVariables) as Record<string, unknown>[])
      : undefined
  }) as DomainOverrides['providers'];

  // ---------- subservice ----------
  const codeSandboxBaseUrl = optionalText(legacyEnv.CODE_SANDBOX_URL);
  const rawEnv = legacyEnv as unknown as Record<string, unknown>;
  const readExtraLegacyEnv = (key: string) =>
    Object.hasOwn(rawEnv, key) ? rawEnv[key] : process.env[key];
  const rawSandboxProvider = readExtraLegacyEnv('AGENT_SANDBOX_PROVIDER');
  const normalizedSandboxProvider =
    typeof rawSandboxProvider === 'string' ? rawSandboxProvider.trim().toLowerCase() : undefined;
  const openSandboxBaseUrl = optionalText(legacyEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL);
  const openSandboxApiKey = optionalText(legacyEnv.AGENT_SANDBOX_OPENSANDBOX_API_KEY);
  const hasLegacySealosEnv = Boolean(
    optionalText(readExtraLegacyEnv('AGENT_SANDBOX_SEALOS_BASEURL')) ||
    optionalText(readExtraLegacyEnv('AGENT_SANDBOX_SEALOS_TOKEN'))
  );
  const validSandboxProxy = (() => {
    const wsUrl = optionalText(readExtraLegacyEnv(agentSandboxProxyEnvKeys.wsUrl))?.trim() ?? '';
    const previewUrl =
      optionalText(readExtraLegacyEnv(agentSandboxProxyEnvKeys.previewUrl))?.trim() ?? '';
    const secret = optionalText(readExtraLegacyEnv(agentSandboxProxyEnvKeys.secret)) ?? '';
    if (!wsUrl || !previewUrl || secret.length < 32) return undefined;
    const parsed = AgentSandboxProxyConfigSchema.safeParse({ wsUrl, previewUrl, secret });
    return parsed.success ? parsed.data : undefined;
  })();
  const isLegacyEnvTemplatePlaceholder =
    openSandboxBaseUrl === 'http://localhost:8090' &&
    validSandboxProxy?.wsUrl === 'ws://localhost:3006' &&
    validSandboxProxy?.previewUrl === 'http://localhost:3006' &&
    validSandboxProxy?.secret === 'default_fastgpt_agent_sandbox_proxy_secret';
  // 旧版若显式声明 AGENT_SANDBOX_PROVIDER，仅在 opensandbox 时启用，保留 "" / none / sealosdevbox 的禁用语义；
  // 新版 Helm / Compose 已移除该变量，未声明时凭完整控制面+代理凭据启用，但排除旧 .env.template 默认占位值以及仅配置了旧 Sealos Devbox（无 OpenSandbox API Key）的环境。
  const providerAllowsOpenSandbox =
    normalizedSandboxProvider === undefined
      ? !isLegacyEnvTemplatePlaceholder && (!hasLegacySealosEnv || Boolean(openSandboxApiKey))
      : normalizedSandboxProvider === 'opensandbox';
  const agentSandboxEnabled = Boolean(
    providerAllowsOpenSandbox && openSandboxBaseUrl && validSandboxProxy
  );
  const resolvedSandboxProxy = agentSandboxEnabled ? validSandboxProxy : undefined;

  overrides.subservice = compact({
    codeSandbox: compact({
      enabled: codeSandboxBaseUrl ? true : undefined,
      url: codeSandboxBaseUrl,
      token: codeSandboxBaseUrl
        ? (optionalText(legacyEnv.CODE_SANDBOX_TOKEN) ?? 'codesandbox')
        : undefined
    }),
    mcp: compact({
      enabled: optionalText(legacyEnv.SSE_MCP_SERVER_PROXY_ENDPOINT) ? true : undefined,
      sseProxyUrl: optionalText(legacyEnv.SSE_MCP_SERVER_PROXY_ENDPOINT)
    }),
    agentSandbox: compact({
      enabled: agentSandboxEnabled ? true : undefined,
      proxy: resolvedSandboxProxy,
      common: compact({
        cpuCount: optionalNumber(legacyEnv.AGENT_SANDBOX_CPU_COUNT),
        memoryMiB: optionalNumber(legacyEnv.AGENT_SANDBOX_MEMORY_MIB),
        storageSizeGi: optionalNumber(legacyEnv.AGENT_SANDBOX_STORAGE_SIZE_GI),
        suspendMinutes: optionalNumber(legacyEnv.AGENT_SANDBOX_SUSPEND_MINUTES),
        archiveInactiveDays: optionalNumber(legacyEnv.AGENT_SANDBOX_ARCHIVE_INACTIVE_DAYS),
        maxEditDebug:
          optionalNumber(systemEnv.agentSandboxMax) ?? optionalNumber(legacyEnv.AGENT_SANDBOX_MAX),
        // null 是旧库中的显式"不限量"，不能被环境变量的配额重新覆盖。
        maxPerTeam:
          systemEnv.agentSandboxMaxPerTeam === null
            ? null
            : (optionalNumber(systemEnv.agentSandboxMaxPerTeam) ??
              optionalNumber(legacyEnv.AGENT_SANDBOX_MAX_PER_TEAM)),
        npmRegistry: optionalText(legacyEnv.AGENT_SANDBOX_NPM_REGISTRY),
        pypiIndexUrl: optionalText(legacyEnv.AGENT_SANDBOX_PYPI_INDEX_URL),
        aptMirror: optionalText(legacyEnv.AGENT_SANDBOX_APT_MIRROR)
      }),
      opensandbox: compact({
        baseUrl: openSandboxBaseUrl,
        apiKey: optionalText(legacyEnv.AGENT_SANDBOX_OPENSANDBOX_API_KEY),
        runtime: optionalText(legacyEnv.AGENT_SANDBOX_OPENSANDBOX_RUNTIME),
        image: optionalText(legacyEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE),
        useServerProxy: optionalBool(legacyEnv.AGENT_SANDBOX_OPENSANDBOX_USE_SERVER_PROXY),
        volumeManagerUrl: optionalText(legacyEnv.AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL),
        volumeManagerToken: optionalText(legacyEnv.AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_TOKEN),
        volumeNamePrefix: optionalText(legacyEnv.AGENT_SANDBOX_OPENSANDBOX_VOLUME_NAME_PREFIX)
      })
    })
  }) as DomainOverrides['subservice'];

  logInstanceConfigRead({
    callsite: 'migration.instanceConfig.buildLegacyDomainOverrides',
    source: 'migration',
    fields: Object.entries(overrides).map(([domain, value]) => ({
      path: domain,
      value
    }))
  });

  return overrides;
};

/**
 * 生成「相对 Schema 默认值」的稀疏 overrides。
 * defaults 仅用于空集合首次初始化；旧数据库和历史 ENV 的迁移结果优先于文件默认值。
 * 与环境变量默认值相同的项被剪枝，避免把当前默认值固化成覆盖项，
 * 使后续版本调整默认值时老实例也能自动跟随。
 */
export const buildSparseLegacyMigrationPlan = ({
  feConfigs,
  systemEnv,
  proConfig,
  defaults
}: {
  feConfigs: LegacyFeConfigs;
  systemEnv: LegacySystemEnv;
  proConfig?: LegacyProConfig;
  defaults?: DomainOverrides;
}): { overrides: DomainOverrides; explicitDefaultPaths: DomainExplicitDefaultPaths } => {
  const raw = buildLegacyDomainOverrides({ feConfigs, systemEnv });
  const pro = buildLegacyProOverrides(proConfig ?? {});

  // 商业版字段与主站字段合并到同一份 overrides，deepMerge 语义下逐字段合并
  const merged: DomainOverrides = { ...raw };
  for (const domain of SYSTEM_INSTANCE_CONFIG_DOMAINS) {
    const proOverrides = pro[domain];
    if (!proOverrides) continue;
    merged[domain] = { ...(merged[domain] ?? {}), ...proOverrides };
  }

  // 旧邮箱注册真实开关可能在 feConfigs.register_method 中，而不是 Pro 的 auth.email.register。
  // 只有后者缺失时才用旧数组推导，避免显式保存过的 Pro 开关被旧数组覆盖。
  const legacyAuth = (merged.auth ?? {}) as LegacyFeConfigs;
  const loginProviders = (legacyAuth.loginProviders ?? {}) as LegacyFeConfigs;
  if (loginProviders.email?.register === undefined && Array.isArray(feConfigs.register_method)) {
    merged.auth = {
      ...legacyAuth,
      loginProviders: {
        ...loginProviders,
        email: {
          ...(loginProviders.email ?? {}),
          register: feConfigs.register_method.includes('email')
        }
      }
    };
  }

  const sparse: DomainOverrides = {};
  const explicitDefaultPaths: DomainExplicitDefaultPaths = {};

  /** 凭据组整组采用旧来源，避免旧密钥被发送到文件默认地址，或反向泄漏文件密钥。 */
  const removeMixedCredentials = (
    fileDefaults: Record<string, unknown>,
    legacy: Record<string, unknown>
  ) => {
    const groups = [
      ['url', 'key'],
      ['url', 'token'],
      ['baseUrl', 'apiKey'],
      ['baseUrl', 'token'],
      ['volumeManagerUrl', 'volumeManagerToken'],
      ['wsUrl', 'previewUrl', 'secret']
    ];
    for (const fields of groups) {
      if (fields.some((field) => Object.hasOwn(legacy, field))) {
        for (const field of fields) delete fileDefaults[field];
      }
    }
    for (const [key, value] of Object.entries(fileDefaults)) {
      const oldValue = legacy[key];
      if (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        oldValue !== null &&
        typeof oldValue === 'object' &&
        !Array.isArray(oldValue)
      ) {
        removeMixedCredentials(
          value as Record<string, unknown>,
          oldValue as Record<string, unknown>
        );
      }
    }
  };

  for (const domain of SYSTEM_INSTANCE_CONFIG_DOMAINS) {
    // 文件仅提供最低优先级的首次初始化值，旧数据库与迁移 ENV 保留原有优先级。
    if (defaults?.[domain] !== undefined) {
      const fileDefaults = structuredClone(defaults[domain]);
      removeMixedCredentials(fileDefaults, merged[domain] ?? {});
      merged[domain] = deepMergeConfig(fileDefaults, merged[domain]);
    }
    const domainOverrides = merged[domain];
    if (!domainOverrides) continue;

    const pruned = pruneDefaultOverrides(domainOverrides, getDomainDefaultConfig(domain));
    if (pruned) {
      sparse[domain] = pruned;
    }
    if (defaults?.[domain] !== undefined) {
      explicitDefaultPaths[domain] = collectPrunedLeafPaths({
        submitted: domainOverrides,
        pruned
      });
    }
  }

  /**
   * checkExternalFile=false 等于 Schema 默认值，会被稀疏剪枝删除。
   * 但旧配置显式关闭外链检查是管理员意图，必须通过 explicitDefaultPaths 带过迁移，
   * 否则后置 backfill 会把非空白名单误判为“未初始化”并重新开启检查。
   */
  if (
    typeof systemEnv.checkExternalFile === 'boolean' &&
    sparse.security?.checkExternalFile === undefined
  ) {
    explicitDefaultPaths.security = Array.from(
      new Set([...(explicitDefaultPaths.security ?? []), 'checkExternalFile'])
    );
  }

  return { overrides: sparse, explicitDefaultPaths };
};

/** 兼容旧调用：只返回稀疏 overrides；需要显式默认意图时使用 migration plan。 */
export const buildSparseLegacyOverrides = (
  input: Parameters<typeof buildSparseLegacyMigrationPlan>[0]
): DomainOverrides => buildSparseLegacyMigrationPlan(input).overrides;

/**
 * 将旧 fastLogin 配置规范化为新 schema 的数组形状。
 * 历史来源有两种：
 * - 对象形状 `Record<key, { authUrl }>`：旧商业版 Admin 的实际存储形状（textarea JSON.parse 产物）；
 * - 数组形状 `[{ key, authUrl }]`：新版表单形状。
 * 对象按 entries 展开为数组，缺 authUrl 的条目丢弃（无法生成有效跳转地址），
 * 其余交给 compactDeep 清理 undefined；两种形状都不合法或为空时返回 undefined 不写覆盖项。
 */
const normalizeFastLogin = (raw: unknown): Record<string, unknown>[] | undefined => {
  if (Array.isArray(raw)) {
    // 数组分支与对象分支保持一致：authUrl 为空的条目无法生成有效跳转地址，
    // 且 schema 的 urlWithDefault('') 会放行空串，不过滤会落库可点击但跳空地址的按钮
    const compacted = compactDeep(raw) as Record<string, unknown>[] | undefined;
    const list = compacted?.filter((item) => isNonEmpty(item?.authUrl));
    return list && list.length > 0 ? list : undefined;
  }
  if (raw !== null && typeof raw === 'object') {
    const list = Object.entries(raw as Record<string, { authUrl?: string }>)
      .filter(([, value]) => isNonEmpty(value?.authUrl))
      .map(([key, value]) => ({ key, authUrl: String(value.authUrl).trim() }));
    return list.length > 0 ? list : undefined;
  }
  return undefined;
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
  const cancellation = (pro.accountCancellation ?? {}) as LegacyProConfig;

  /** 短信模板已只保留中文：英文模板仅作为历史兼容的兜底来源，迁移后不再写入运行时。 */
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
        bindNotification: pair(sms.BIND_NOTIFICATION, sms.BIND_NOTIFICATION_EN),
        modelDeprecation: pair(sms.MODEL_DEPRECATION, sms.MODEL_DEPRECATION_EN)
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
        tenantId: optionalText(microsoft.tenantId)
      })
    }),
    fastLogin: normalizeFastLogin(pro.fastLogin),
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
        publicCertContent: optionalText(alipay.ALIPAY_PUBLIC_CERT_CONTENT)
      }),
      bank: compact({ description: optionalText(bank.description) })
    }),
    billingNotify: compact({
      lackOfPoints: pair(sms.LACK_OF_POINTS, sms.LACK_OF_POINTS_EN),
      pointsThirtyPercentRemain: pair(
        sms.POINTS_THIRTY_PERCENT_REMAIN,
        sms.POINTS_THIRTY_PERCENT_REMAIN_EN
      ),
      pointsTenPercentRemain: pair(sms.POINTS_TEN_PERCENT_REMAIN, sms.POINTS_TEN_PERCENT_REMAIN_EN),
      freeClean: pair(sms.FREE_CLEAN, sms.FREE_CLEAN_EN),
      expireSoon: pair(sms.EXPIRE_SOON, sms.EXPIRE_SOON_EN),
      expired: pair(sms.EXPIRED, sms.EXPIRED_EN)
    })
  }) as DomainOverrides['commercial'];

  logInstanceConfigRead({
    callsite: 'migration.instanceConfig.buildLegacyProOverrides',
    source: 'migration',
    fields: Object.entries(overrides).map(([domain, value]) => ({
      path: domain,
      value
    }))
  });

  return overrides;
};

/**
 * 检测已改由环境变量承载、但旧库仍有值的历史字段。
 * show_git 不再读取旧库；提示商业版使用 App ENV，开源版固定展示。
 */
export const collectEnvRehomedWarnings = ({
  feConfigs
}: {
  feConfigs: LegacyFeConfigs;
  systemEnv?: LegacySystemEnv;
}): string[] => {
  const warnings: string[] = [];

  // 商业版默认关闭，开源版固定开启，不能再承诺旧库的关闭值被保留。
  if (feConfigs.show_git === false) {
    warnings.push(
      'show_git=false -> 商业版由 App 环境变量 SHOW_GIT=false 控制（默认关闭），与 License 激活无关；开源版固定展示'
    );
  }
  if (isNonEmpty(feConfigs.ip_whitelist)) {
    warnings.push('ip_whitelist 已废弃，旧值将被忽略');
  }
  return warnings;
};

/**
 * 迁移只报告保存约束问题，不删除、替换或拒绝历史配置。
 * 告警只含域和字段路径，避免 URL、凭据等原值进入日志。
 */
export const sanitizeOverridesForSchema = ({
  overrides,
  warnings,
  issues = []
}: {
  overrides: DomainOverrides;
  warnings: string[];
  issues?: SchemaSanitizedIssue[];
}): DomainOverrides => {
  for (const domain of SYSTEM_INSTANCE_CONFIG_DOMAINS) {
    if (overrides[domain] === undefined) continue;
    const result = systemInstanceConfigDomainSchemaMap[domain].safeParse(
      deepMergeConfig(getDomainDefaultConfig(domain), overrides[domain])
    );
    if (!result.success) {
      for (const issue of result.error.issues) {
        const path = issue.path.join('.');
        warnings.push(`${domain}${path ? `.${path}` : ''} 配置不满足保存校验，已保留原值`);
        issues.push({ domain, ...(path ? { path } : {}) });
      }
    }
  }
  return structuredClone(overrides);
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * 计算 target 相对已有 overrides 缺失的子树（只补缺、不覆盖）。
 *
 * 两类路径不补写：
 * - 已有值：文档上存在该 key 就不再下沉，数组与 null 按原子值处理；
 * - 使用方明确设为内置默认值的路径（explicitDefaultPaths）：稀疏 overrides 中缺键既可能是
 *   "从未配置"，也可能是"明确清空/设回默认值"，只有前者才能补写。
 * 返回 undefined 表示该域无需写入。
 */
const computeMissingOverrides = ({
  existing,
  target,
  explicitDefaultPaths,
  prefix = []
}: {
  existing: unknown;
  target: Record<string, unknown>;
  explicitDefaultPaths: Set<string>;
  prefix?: string[];
}): Record<string, unknown> | undefined => {
  const existingObject = isPlainObject(existing) ? existing : undefined;
  const missing: Record<string, unknown> = {};

  for (const [key, targetValue] of Object.entries(target)) {
    if (targetValue === undefined) continue;

    const path = [...prefix, key];
    const keyPresent = !!existingObject && key in existingObject;
    const existingValue = existingObject?.[key];

    if (isPlainObject(targetValue)) {
      // 已有键是非对象原子值：视为已配置，不再下钻
      if (keyPresent && !isPlainObject(existingValue)) continue;

      // 即使整棵子树缺失也要下钻，才能识别更深层的"显式默认值"
      const nested = computeMissingOverrides({
        existing: keyPresent ? existingValue : undefined,
        target: targetValue,
        explicitDefaultPaths,
        prefix: path
      });
      if (nested) missing[key] = nested;
      continue;
    }

    // 叶子（含数组/null）：已有值优先；使用方明确设过默认值的也不再补写
    if (keyPresent || explicitDefaultPaths.has(path.join('.'))) continue;

    missing[key] = targetValue;
  }

  return Object.keys(missing).length > 0 ? missing : undefined;
};

/** 把补缺子树合并回已有 overrides；已有值始终优先，只追加缺失键。 */
const mergeMissingOverrides = (
  existing: Record<string, unknown>,
  missing: Record<string, unknown>
): Record<string, unknown> => {
  const merged: Record<string, unknown> = { ...existing };

  for (const [key, value] of Object.entries(missing)) {
    const current = merged[key];
    if (isPlainObject(current) && isPlainObject(value)) {
      merged[key] = mergeMissingOverrides(current, value);
    } else if (!(key in merged)) {
      merged[key] = value;
    }
  }

  return merged;
};

/** 展开补缺子树的叶子路径（数组与 null 视为叶子），用于日志与迁移结果统计。 */
const flattenOverridePaths = (value: Record<string, unknown>, prefix: string[] = []): string[] =>
  Object.entries(value).flatMap(([key, child]) =>
    isPlainObject(child)
      ? flattenOverridePaths(child, [...prefix, key])
      : [[...prefix, key].join('.')]
  );

/** 已有 override 比旧配置的默认值意图更新，不能再为同一路径补写默认值标记。 */
const missingLegacyDefaultPaths = ({
  declared,
  existingOverrides,
  existingPaths
}: {
  declared: string[];
  existingOverrides: Record<string, unknown>;
  existingPaths: Set<string>;
}): string[] =>
  declared.filter((path) => !existingPaths.has(path) && !hasOverridePath(existingOverrides, path));

/**
 * 识别存量域文档中尚未清理但具有明确默认禁用语义的旧字段（如 `agentSandbox.provider = 'none' | 'sealosdevbox'`），
 * 防止 Stage 2 环境变量补缺在 Stage 3 废弃字段清理前误把 `agentSandbox.enabled` 翻转为 `true`。
 */
const deriveImplicitLegacyDisabledPaths = (
  domain: SystemInstanceConfigDomainKey,
  existingOverrides: Record<string, unknown>
): string[] => {
  if (
    domain === 'subservice' &&
    isPlainObject(existingOverrides.agentSandbox) &&
    typeof existingOverrides.agentSandbox.provider === 'string' &&
    existingOverrides.agentSandbox.provider !== 'opensandbox' &&
    !Object.hasOwn(existingOverrides.agentSandbox, 'enabled')
  ) {
    return ['agentSandbox.enabled'];
  }
  return [];
};

/**
 * 读取旧配置来源并生成迁移计划。
 * 仅当 11 个业务域均为空时读取 App defaultConfig.json；Pro ENV scope 不参与判空。
 *
 * 完成度按「域是否齐全」+「域内是否还缺字段」两级判定：
 * - 只看 count>0 会把部分写入失败后的残缺状态误判为已完成；
 * - 只看整域是否存在，会让曾经被写入过的域里客户已配置的环境变量永久进不来，
 *   因为环境变量只在这条迁移链路上进入实例配置。
 */
export const inspectInstanceConfigMigration = async () => {
  const [existingDocs, legacyFastgpt, legacyPro] = await Promise.all([
    MongoSystemInstanceConfig.find(
      { domain: { $in: SYSTEM_INSTANCE_CONFIG_DOMAINS } },
      { _id: 1, domain: 1, overrides: 1, explicitDefaultPaths: 1 }
    ).lean(),
    MongoSystemConfigs.findOne({ type: SystemConfigsTypeEnum.fastgpt })
      .sort({ type: 1, _id: -1 })
      .lean(),
    MongoSystemConfigs.findOne({ type: SystemConfigsTypeEnum.fastgptPro })
      .sort({ type: 1, _id: -1 })
      .lean()
  ]);

  const feConfigs = (legacyFastgpt?.value?.feConfigs ?? {}) as LegacyFeConfigs;
  const systemEnv = (legacyFastgpt?.value?.systemEnv ?? {}) as LegacySystemEnv;
  const proConfig = (legacyPro?.value ?? {}) as LegacyProConfig;

  const { overrides: rawOverrides, explicitDefaultPaths: legacyExplicitDefaultPaths } =
    buildSparseLegacyMigrationPlan({ feConfigs, systemEnv, proConfig });
  // 旧值可能不满足收紧后的 Schema；先净化再统计缺失域，避免 blockStartup 迁移崩溃
  const schemaSanitizedWarnings: string[] = [];
  const schemaSanitizedIssues: SchemaSanitizedIssue[] = [];
  const overrides = sanitizeOverridesForSchema({
    overrides: rawOverrides,
    warnings: schemaSanitizedWarnings,
    issues: schemaSanitizedIssues
  });
  // 判空只决定是否导入文件，不替代迁移状态；完整域集合仍由迁移框架校验。
  let initialization: DefaultConfigInitialization | undefined;
  if (existingDocs.length === 0) {
    const initialPlan = buildSparseLegacyMigrationPlan({
      feConfigs,
      systemEnv,
      proConfig,
      defaults: await readDefaultInstanceConfig()
    });
    initialization = {
      overrides: sanitizeOverridesForSchema({
        overrides: initialPlan.overrides,
        warnings: schemaSanitizedWarnings,
        issues: schemaSanitizedIssues
      }),
      explicitDefaultPaths: initialPlan.explicitDefaultPaths
    };
  }
  const existingDomains = new Set<string>(
    existingDocs.map((doc) => String((doc as any).domain ?? doc._id))
  );
  // 完成条件必须按全部 Domain 判断：applyInstanceConfigMigration 会为没有 overrides 的
  // Domain 也写入空文档（Schema 默认值），这里若只统计"有非默认 overrides 的域"，
  // 缺失的默认域会被误判为已完成，迁移入口直接 skipped，Pro 的 11 域启动断言随后失败。
  const missingDomainCount = SYSTEM_INSTANCE_CONFIG_DOMAINS.filter(
    (domain) => !existingDomains.has(domain)
  ).length;

  // 已有域里仍缺失的字段：整域存在不代表迁移已完成，客户已配置的环境变量可能还没进来
  const existingDocsByDomain = new Map<
    string,
    {
      overrides: Record<string, unknown>;
      explicitDefaultPaths: Set<string>;
      damagedSecurityOverrides: boolean;
    }
  >(
    existingDocs.map((doc) => [
      String((doc as any).domain ?? doc._id),
      {
        overrides: decryptDomainSecrets(
          (doc as any).domain ?? doc._id,
          (doc.overrides ?? {}) as Record<string, unknown>
        ),
        explicitDefaultPaths: new Set(
          Array.isArray((doc as any).explicitDefaultPaths) ? (doc as any).explicitDefaultPaths : []
        ),
        damagedSecurityOverrides:
          doc.domain === 'security' && hasDamagedSecurityOverrides(doc.overrides)
      }
    ])
  );
  const pendingBackfillPaths: string[] = [];
  const pendingBackfillDomainCount = SYSTEM_INSTANCE_CONFIG_DOMAINS.filter((domain) => {
    const targetOverrides = overrides[domain] ?? {};
    const existingEntry = existingDocsByDomain.get(domain);
    if (!existingEntry || existingEntry.damagedSecurityOverrides) return false;

    const declaredExplicit = legacyExplicitDefaultPaths[domain] ?? [];
    const implicitDisabledPaths = deriveImplicitLegacyDisabledPaths(
      domain,
      existingEntry.overrides
    );
    const effectiveExistingPaths = new Set([
      ...existingEntry.explicitDefaultPaths,
      ...implicitDisabledPaths
    ]);
    const missingExplicitPaths = missingLegacyDefaultPaths({
      declared: declaredExplicit,
      existingOverrides: existingEntry.overrides,
      existingPaths: effectiveExistingPaths
    });
    const missing = computeMissingOverrides({
      existing: existingEntry.overrides,
      target: targetOverrides,
      explicitDefaultPaths: new Set([...effectiveExistingPaths, ...missingExplicitPaths])
    });
    if (!missing && missingExplicitPaths.length === 0) return false;

    if (missing) {
      pendingBackfillPaths.push(
        ...flattenOverridePaths(missing).map((path) => `${domain}.${path}`)
      );
    }
    pendingBackfillPaths.push(...missingExplicitPaths.map((path) => `${domain}.${path}`));
    return true;
  }).length;

  return {
    existingDomainCount: existingDocs.length,
    missingDomainCount,
    pendingBackfillDomainCount,
    pendingBackfillPaths,
    hasLegacyConfig: !!legacyFastgpt || !!legacyPro,
    hasLegacyProConfig: !!legacyPro,
    envRehomedWarnings: collectEnvRehomedWarnings({ feConfigs, systemEnv }),
    schemaSanitizedWarnings,
    schemaSanitizedIssues,
    initialization,
    overrides,
    explicitDefaultPaths: legacyExplicitDefaultPaths
  };
};

/** 回填撞上管理员并发保存时的重试次数；仍冲突则抛错，避免静默漏写客户配置。 */
const MAX_BACKFILL_CONFLICT_RETRIES = 3;

/**
 * 按域幂等写入 Domain 文档：
 * - 首次启动传入 initialization 时，先在同一事务中判空并创建全部域；
 * - 文档不存在：整域新建，等价于首次迁移；
 * - 文档已存在：只补写缺失的叶子字段，已有值绝不覆盖（管理员保存过的配置优先）。
 *
 * 已存在的域不能整域跳过：客户的环境变量只在这条迁移链路上进入实例配置，
 * 只要该域曾被旧版本迁移或管理员写入过，整域跳过就会让客户已配置的 env 值永久丢失。
 */
export const applyInstanceConfigMigration = async ({
  overrides,
  explicitDefaultPaths,
  initialization,
  logger
}: {
  overrides: DomainOverrides;
  explicitDefaultPaths?: DomainExplicitDefaultPaths;
  initialization?: DefaultConfigInitialization;
  logger: SystemMigrationLogger;
}) => {
  const domains = SYSTEM_INSTANCE_CONFIG_DOMAINS;
  const createdDomains: SystemInstanceConfigDomainKey[] = initialization
    ? await initializeEmptyInstanceConfig(initialization)
    : [];
  const backfilledDomains: SystemInstanceConfigDomainKey[] = [];
  const backfilledPaths: string[] = [];
  const backfillSkippedPaths: string[] = [];

  /** 回填只补缺失字段，保留管理员值和显式默认；业务规则冲突仅告警，CAS 冲突继续重试。 */
  const backfillDomain = async (
    domain: SystemInstanceConfigDomainKey,
    targetOverrides: Record<string, unknown>
  ): Promise<{ acceptedPaths: string[]; skippedPaths: string[] }> => {
    for (let attempt = 0; attempt <= MAX_BACKFILL_CONFLICT_RETRIES; attempt++) {
      const doc = await MongoSystemInstanceConfig.findOne({ domain }).lean();
      // 文档被并发删除：本次不处理，交给下一轮迁移补齐
      if (!doc) return { acceptedPaths: [], skippedPaths: [] };
      if (domain === 'security' && hasDamagedSecurityOverrides(doc.overrides)) {
        logger.warn('Damaged security configuration retained for administrator repair', { domain });
        return { acceptedPaths: [], skippedPaths: [] };
      }

      const existingOverrides = decryptDomainSecrets(
        domain,
        (doc.overrides ?? {}) as Record<string, unknown>
      );
      const existingExplicitDefaultPaths = new Set(
        Array.isArray((doc as any).explicitDefaultPaths)
          ? ((doc as any).explicitDefaultPaths as string[])
          : []
      );
      const declaredExplicitDefaultPaths = explicitDefaultPaths?.[domain] ?? [];
      const implicitDisabledPaths = deriveImplicitLegacyDisabledPaths(domain, existingOverrides);
      const effectiveExistingPaths = new Set([
        ...existingExplicitDefaultPaths,
        ...implicitDisabledPaths
      ]);
      const missingExplicitPaths = missingLegacyDefaultPaths({
        declared: declaredExplicitDefaultPaths,
        existingOverrides,
        existingPaths: effectiveExistingPaths
      });
      const explicitDefaultPathsSet = new Set([...effectiveExistingPaths, ...missingExplicitPaths]);
      const missing = computeMissingOverrides({
        existing: existingOverrides,
        target: targetOverrides,
        explicitDefaultPaths: explicitDefaultPathsSet
      });
      if (!missing && missingExplicitPaths.length === 0) {
        return { acceptedPaths: [], skippedPaths: [] };
      }

      const mergedOverrides = mergeMissingOverrides(existingOverrides, missing ?? {});
      readMigrationDomainConfig({ domain, overrides: mergedOverrides });
      const acceptedPaths = missing ? flattenOverridePaths(missing) : [];
      const skippedPaths: string[] = [];
      const nextExplicitDefaultPaths = Array.from(
        new Set([...existingExplicitDefaultPaths, ...missingExplicitPaths])
      );

      const updated = await MongoSystemInstanceConfig.updateOne(
        { domain, revision: doc.revision },
        {
          $set: {
            overrides: encryptDomainSecrets({
              domain,
              data: mergedOverrides,
              previousStored: doc.overrides
            }),
            explicitDefaultPaths: nextExplicitDefaultPaths,
            updatedAt: new Date()
          },
          $inc: { revision: 1 }
        },
        { runValidators: false }
      );
      if (updated.modifiedCount > 0) {
        const acceptedExplicitPaths = missingExplicitPaths.filter((path) =>
          nextExplicitDefaultPaths.includes(path)
        );
        return { acceptedPaths: [...acceptedPaths, ...acceptedExplicitPaths], skippedPaths };
      }
    }

    throw new Error(
      `Instance config backfill for domain "${domain}" keeps conflicting with concurrent writes`
    );
  };

  // 11 个 domain 必须全部初始化：空 overrides 也要落库，否则全新安装会因 Pro 启动断言缺域而无法就绪。
  for (const domain of domains) {
    const targetOverrides = overrides[domain] ?? {};
    // 迁入前只诊断配置，不因新的保存规则剔除历史值。
    readMigrationDomainConfig({ domain, overrides: targetOverrides });

    const inserted = await MongoSystemInstanceConfig.updateOne(
      { domain },
      {
        $setOnInsert: {
          domain,
          schemaVersion: SYSTEM_INSTANCE_CONFIG_SCHEMA_VERSION,
          revision: 1,
          overrides: encryptDomainSecrets({ domain, data: targetOverrides }),
          ...(explicitDefaultPaths?.[domain]?.length
            ? { explicitDefaultPaths: explicitDefaultPaths[domain] }
            : {}),
          updatedBy: { actor: 'migration' }
        }
      },
      { upsert: true, runValidators: false }
    );

    if (inserted.upsertedCount > 0) {
      createdDomains.push(domain);
      continue;
    }

    const filled = await backfillDomain(domain, targetOverrides);
    if (filled.acceptedPaths.length > 0) {
      backfilledDomains.push(domain);
      backfilledPaths.push(...filled.acceptedPaths.map((path) => `${domain}.${path}`));
    }
    backfillSkippedPaths.push(...filled.skippedPaths.map((path) => `${domain}.${path}`));
  }

  const writtenDomains = [...createdDomains, ...backfilledDomains];

  logger.info('Instance config migration applied', {
    createdDomains,
    backfilledDomains,
    backfilledPaths,
    backfillSkippedPaths
  });

  return {
    domains: writtenDomains,
    migratedCount: writtenDomains.length,
    createdDomains,
    backfilledDomains,
    backfilledPaths,
    backfillSkippedPaths
  };
};
