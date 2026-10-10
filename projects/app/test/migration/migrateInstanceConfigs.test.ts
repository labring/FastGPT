import { describe, expect, it } from 'vitest';
import {
  buildLegacyDomainOverrides,
  buildLegacyProOverrides,
  buildSparseLegacyOverrides,
  collectEnvRehomedWarnings
} from '@/migration/tasks/4180/20260928_migrate_instance_configs/service';
import {
  SYSTEM_INSTANCE_CONFIG_DOMAINS,
  resolveDomainEffectiveConfig
} from '@fastgpt/global/common/system/config/schema';
import { serviceEnv } from '@fastgpt/service/env';
import { appEnv } from '@/env';

describe('migration buildLegacyDomainOverrides', () => {
  it('maps legacy feConfigs values into the site domain', () => {
    const overrides = buildLegacyDomainOverrides({
      feConfigs: {
        systemTitle: 'My Platform',
        favicon: '/custom.ico',
        docUrl: 'https://docs.example.com',
        openAPIDocUrl: 'https://docs.example.com/api',
        concatMd: 'hello',
        appTemplateCourse: 'https://course.example.com',
        loginGuideDocUrl: 'https://guide.example.com'
      },
      systemEnv: { openapiPrefix: 'myorg' }
    });

    expect(overrides.site).toMatchObject({
      name: 'My Platform',
      favicon: '/custom.ico',
      docUrl: 'https://docs.example.com',
      openApiDocUrl: 'https://docs.example.com/api',
      concatMd: 'hello',
      appTemplateCourse: 'https://course.example.com',
      loginGuideDocUrl: 'https://guide.example.com',
      openApiPrefix: 'myorg'
    });
  });

  it('maps legacy censor / fileUrlWhitelist / workflowHttpNode into security', () => {
    const overrides = buildLegacyDomainOverrides({
      feConfigs: {},
      systemEnv: {
        censor: {
          BAIDU_TEXT_CENSOR_CLIENTID: 'bid',
          BAIDU_TEXT_CENSOR_CLIENTSECRET: 'bsecret',
          customCensorURL: 'https://censor.example.com'
        },
        workflowHttpNode: { ignoreHttpsCertificate: true },
        fileUrlWhitelist: ['https://cdn.example.com']
      }
    });

    expect(overrides.security).toMatchObject({
      censor: {
        baiduClientId: 'bid',
        baiduClientSecret: 'bsecret',
        customCensorUrl: 'https://censor.example.com'
      },
      workflowHttpNode: { ignoreHttpsCertificate: true },
      fileUrlWhitelist: ['https://cdn.example.com']
    });
  });

  it('drops empty strings so schema defaults stay authoritative', () => {
    // 空值与纯空白不应产生覆盖项；env 兜底后等于默认值的项由 sparse 阶段剪枝
    const sparse = buildSparseLegacyOverrides({
      feConfigs: { systemTitle: '', docUrl: '' },
      systemEnv: { openapiPrefix: '   ' }
    });

    expect(sparse.site).toBeUndefined();
  });

  it('produces validated effective config for every mapped domain', () => {
    const overrides = buildLegacyDomainOverrides({
      feConfigs: {
        systemTitle: 'Platform',
        limit: { maxFolderDepth: 6, exportDatasetLimitMinutes: 30, websiteSyncLimitMinuted: 90 },
        navbarItems: [
          { id: 'docs', name: 'Docs', avatar: '', url: 'https://d.com', isActive: true }
        ],
        externalProviderWorkflowVariables: [
          { name: 'Var', key: 'var', intro: 'intro', isOpen: true }
        ],
        customApiDomain: 'https://api.custom.com',
        customSharePageDomain: 'https://share.custom.com',
        scripts: [{ src: 'https://cdn.example.com/analytics.js', async: 'true' }]
      },
      systemEnv: {}
    });

    for (const domain of SYSTEM_INSTANCE_CONFIG_DOMAINS) {
      const domainOverrides = overrides[domain];
      if (!domainOverrides) continue;
      expect(() => resolveDomainEffectiveConfig(domain, domainOverrides)).not.toThrow();
    }

    expect(overrides.resource).toMatchObject({
      maxFolderDepth: 6,
      exportDatasetLimitMinutes: 30,
      websiteSyncLimitMinuted: 90
    });
    expect(overrides.site?.navbarItems).toHaveLength(1);
    expect(overrides.site?.customApiDomain).toBe('https://api.custom.com');
    expect(overrides.site?.customSharePageDomain).toBe('https://share.custom.com');
    expect(overrides.site?.scripts).toEqual([
      { src: 'https://cdn.example.com/analytics.js', async: 'true' }
    ]);
    expect(overrides.providers?.externalProviderWorkflowVariables).toHaveLength(1);
  });

  it('migrates all 4 PDF parser credentials from legacy systemEnv.customPdfParse', () => {
    const overrides = buildLegacyDomainOverrides({
      feConfigs: {},
      systemEnv: {
        customPdfParse: {
          url: 'https://pdf.legacy.com',
          key: 'pdf-key',
          somarkApiKey: 'somark-secret',
          doc2xKey: 'doc2x-secret',
          textinAppId: 'textin-id',
          textinSecretCode: 'textin-code'
        }
      }
    });

    expect(overrides.providers?.documentParse?.customPdf).toMatchObject({
      url: 'https://pdf.legacy.com',
      key: 'pdf-key',
      somarkApiKey: 'somark-secret',
      doc2xKey: 'doc2x-secret',
      textinAppId: 'textin-id',
      textinSecretCode: 'textin-code'
    });
  });
});

describe('migration buildSparseLegacyOverrides', () => {
  it('prunes values identical to schema defaults so defaults can evolve later', () => {
    const sparse = buildSparseLegacyOverrides({
      // 这些值全部等于 Schema 默认值，应被剪枝
      feConfigs: { systemTitle: 'AI', show_emptyChat: true },
      systemEnv: {}
    });

    expect(sparse.site).toBeUndefined();
    expect(sparse.feature).toBeUndefined();
  });

  it('keeps only genuinely customized values', () => {
    const sparse = buildSparseLegacyOverrides({
      feConfigs: { systemTitle: 'Custom Title', show_emptyChat: false },
      systemEnv: {}
    });

    expect(sparse.site?.name).toBe('Custom Title');
    // show_emptyChat 默认 true，改为 false 属真实修改，应保留
    expect(sparse.feature?.showEmptyChat).toBe(false);
    // show_git 已回退为纯环境变量（SHOW_GIT），不再迁移进实例配置
    expect(sparse.feature?.showGit).toBeUndefined();
  });

  it('keeps sparse output validated by the two-phase resolver', () => {
    const sparse = buildSparseLegacyOverrides({
      feConfigs: { limit: { maxFolderDepth: 8 } },
      systemEnv: {}
    });

    for (const domain of SYSTEM_INSTANCE_CONFIG_DOMAINS) {
      const domainOverrides = sparse[domain];
      if (!domainOverrides) continue;
      expect(() => resolveDomainEffectiveConfig(domain, domainOverrides)).not.toThrow();
    }
  });

  it('merges legacy fastgptPro login and payment config into auth/commercial', () => {
    const sparse = buildSparseLegacyOverrides({
      feConfigs: {},
      systemEnv: {},
      proConfig: {
        auth: {
          github: { clientId: 'gh-id', secret: 'gh-secret' },
          email: {
            smtp: 'smtp.example.com',
            user: 'no-reply@example.com',
            pass: 'pwd',
            port: 587,
            secure: false,
            register: true
          },
          sms: { LOGIN: 'SMS_LOGIN', LACK_OF_POINTS: 'SMS_LACK', LACK_OF_POINTS_EN: 'SMS_LACK_EN' },
          phone: {
            SNED_PHONE_ACCESSKEYID: 'ak',
            SNED_PHONE_ACCESSSECRET: 'sk',
            SNED_PHONE_SIGNNAME: 'Sign'
          }
        },
        teamMode: 'multi',
        pay: {
          wx: { WX_APPID: 'wx-app', WX_MCHID: 'mch' },
          alipay: { APP_ID: 'ali-app' }
        }
      }
    });

    expect(sparse.auth?.teamMode).toBe('multi');
    expect(sparse.auth?.loginProviders?.github).toMatchObject({
      clientId: 'gh-id',
      secret: 'gh-secret'
    });
    expect(sparse.auth?.loginProviders?.email).toMatchObject({
      smtp: 'smtp.example.com',
      port: 587,
      secure: false,
      register: true
    });
    expect(sparse.auth?.loginProviders?.phone).toMatchObject({
      accessKeyId: 'ak',
      signName: 'Sign'
    });
    expect(sparse.commercial?.payment?.wx).toMatchObject({ appId: 'wx-app', mchId: 'mch' });
    expect(sparse.commercial?.payment?.alipay).toMatchObject({ appId: 'ali-app' });
    // 账单通知模板（LACK_OF_POINTS）归入 commercial
    expect(sparse.commercial?.billingNotify?.lackOfPoints).toEqual({
      zh: 'SMS_LACK'
    });

    // pro 迁移结果同样必须通过两阶段校验
    for (const domain of SYSTEM_INSTANCE_CONFIG_DOMAINS) {
      const domainOverrides = sparse[domain];
      if (!domainOverrides) continue;
      expect(() => resolveDomainEffectiveConfig(domain, domainOverrides)).not.toThrow();
    }
  });

  it('keeps only the Chinese sms template and falls back to English when missing', () => {
    const pro = buildLegacyProOverrides({
      auth: { sms: { LOGIN: 'SMS_LOGIN_ZH', REGISTER_EN: 'SMS_REGISTER_EN' } }
    });

    expect(pro.auth?.loginProviders?.sms?.login).toEqual({ zh: 'SMS_LOGIN_ZH' });
    // 中文缺失时用英文兜底，避免历史仅配置英文模板的实例丢失模板
    expect(pro.auth?.loginProviders?.sms?.register).toEqual({ zh: 'SMS_REGISTER_EN' });
  });
});

describe('migration collectEnvRehomedWarnings', () => {
  it('warns when legacy show_git was disabled', () => {
    const warnings = collectEnvRehomedWarnings({ feConfigs: { show_git: false } });
    expect(warnings).toEqual([expect.stringContaining('SHOW_GIT=false')]);
  });

  it('does not warn when show_git was enabled or unset', () => {
    expect(collectEnvRehomedWarnings({ feConfigs: { show_git: true } })).toEqual([]);
    expect(collectEnvRehomedWarnings({ feConfigs: {} })).toEqual([]);
  });
});

describe('migration env wiring', () => {
  const pick = (target: unknown, path: string): unknown =>
    path.split('.').reduce<any>((acc, key) => (acc == null ? acc : acc[key]), target);

  /**
   * 客户的环境变量只在这条迁移链路上进入实例配置：任何一条映射断掉，
   * 客户已配置的 env 值在升级后就会变成 Schema 默认值。
   *
   * 这里逐项钉住「配置路径 ← 具体环境变量」的绑定，断言右侧取的是 env 变量本身，
   * 因此换绑到别的变量或删除映射都会失败，且不依赖测试环境里 env 的具体取值。
   * 测试环境未配置的可选 env 取值为 undefined，无法区分"映射断了"与"env 没配"，
   * 故另用最小可断言条数兜底，防止表格被悄悄清空。
   */
  it('maps every domain field back to the exact environment variable it reads', () => {
    const overrides = buildLegacyDomainOverrides({ feConfigs: {}, systemEnv: {} });
    const cases: [string, unknown][] = [
      // site
      ['site.name', appEnv.SYSTEM_NAME],
      ['site.description', appEnv.SYSTEM_DESCRIPTION],
      ['site.favicon', appEnv.SYSTEM_FAVICON],
      ['site.marketplaceUrl', appEnv.MARKETPLACE_URL],
      ['site.customApiDomain', appEnv.CUSTOM_API_DOMAIN],
      ['site.customSharePageDomain', appEnv.CUSTOM_SHARE_PAGE_DOMAIN],
      // auth
      ['auth.openApiKeyMaxCount', appEnv.OPENAPI_KEY_MAX_COUNT],
      ['auth.passwordExpiredMonth', appEnv.PASSWORD_EXPIRED_MONTH ?? null],
      ['auth.wecomLoginAutoRedirect', appEnv.WECOM_LOGIN_AUTO_REDIRECT],
      [
        'auth.defaultTeamBasicPermissionsEnabled',
        serviceEnv.DEFAULT_TEAM_BASIC_PERMISSIONS_ENABLED
      ],
      // security
      ['security.useIpLimit', serviceEnv.USE_IP_LIMIT],
      ['security.checkInternalIp', serviceEnv.CHECK_INTERNAL_IP],
      ['security.csrfEnabled', serviceEnv.CSRF_ENABLED],
      ['security.passwordLoginMinuteLimitCount', serviceEnv.PASSWORD_LOGIN_MINUTE_LIMIT_COUNT],
      ['security.maxLoginSession', serviceEnv.MAX_LOGIN_SESSION],
      ['security.skipFileTypeCheck', serviceEnv.SKIP_FILE_TYPE_CHECK],
      // feature
      ['feature.hideChatCopyrightSetting', appEnv.HIDE_CHAT_COPYRIGHT_SETTING],
      ['feature.multipleDataToBase64', serviceEnv.MULTIPLE_DATA_TO_BASE64],
      ['feature.datasetSynonymEnabled', serviceEnv.DATASET_SYNONYM_ENABLED],
      ['feature.agentEngine', serviceEnv.AGENT_ENGINE],
      ['feature.disableCache', serviceEnv.DISABLE_CACHE],
      // commercial
      ['commercial.showCoupon', appEnv.SHOW_COUPON],
      ['commercial.showDiscountCoupon', appEnv.SHOW_DISCOUNT_COUPON],
      ['commercial.payFormUrl', appEnv.PAY_FORM_URL],
      ['commercial.agentSandboxFreeTip', appEnv.AGENT_SANDBOX_FREE_TIP],
      // resource
      ['resource.serviceRequestMaxContentLength', serviceEnv.SERVICE_REQUEST_MAX_CONTENT_LENGTH],
      ['resource.systemMaxStringLengthM', serviceEnv.SYSTEM_MAX_STRING_LENGTH_M],
      ['resource.maxFolderDepth', serviceEnv.MAX_FOLDER_DEPTH],
      ['resource.appFolderMaxAmount', serviceEnv.APP_FOLDER_MAX_AMOUNT],
      ['resource.datasetFolderMaxAmount', serviceEnv.DATASET_FOLDER_MAX_AMOUNT],
      ['resource.uploadFileMaxSize', serviceEnv.UPLOAD_FILE_MAX_SIZE],
      ['resource.uploadFileMaxAmount', serviceEnv.UPLOAD_FILE_MAX_AMOUNT],
      // performance
      ['performance.workflow.maxRunTimes', serviceEnv.WORKFLOW_MAX_RUN_TIMES],
      ['performance.workflow.maxLoopTimes', serviceEnv.WORKFLOW_MAX_LOOP_TIMES],
      ['performance.workflow.parallelMaxConcurrency', serviceEnv.WORKFLOW_PARALLEL_MAX_CONCURRENCY],
      ['performance.parse.fileTimeoutSeconds', serviceEnv.PARSE_FILE_TIMEOUT_SECONDS],
      ['performance.parse.xlsxMaxRows', serviceEnv.XLSX_PARSE_MAX_ROWS],
      ['performance.parse.xlsxMaxColumns', serviceEnv.XLSX_PARSE_MAX_COLUMNS],
      ['performance.parse.xlsxMaxCells', serviceEnv.XLSX_PARSE_MAX_CELLS],
      ['performance.parse.xlsxMaxMergedCells', serviceEnv.XLSX_PARSE_MAX_MERGED_CELLS],
      ['performance.parse.maxHtmlTransformChars', serviceEnv.MAX_HTML_TRANSFORM_CHARS],
      ['performance.dataset.parseMaxProcess', serviceEnv.DATASET_PARSE_MAX_PROCESS],
      ['performance.dataset.vectorMaxProcess', serviceEnv.VECTOR_MAX_PROCESS],
      ['performance.dataset.qaMaxProcess', serviceEnv.QA_MAX_PROCESS],
      ['performance.dataset.vlmMaxProcess', serviceEnv.VLM_MAX_PROCESS],
      ['performance.dataset.retrievalResultsLimit', serviceEnv.RETRIEVAL_RESULTS_LIMIT],
      ['performance.chat.maxQpm', serviceEnv.CHAT_MAX_QPM],
      ['performance.streamResume.ttlSeconds', serviceEnv.STREAM_RESUME_TTL_SECONDS],
      [
        'performance.streamResume.postCompleteTtlSeconds',
        serviceEnv.STREAM_RESUME_POST_COMPLETE_TTL_SECONDS
      ],
      [
        'performance.streamResume.redisMaxmemoryRatio',
        serviceEnv.STREAM_RESUME_REDIS_MAXMEMORY_RATIO
      ],
      [
        'performance.streamResume.redisMemoryCheckIntervalMs',
        serviceEnv.STREAM_RESUME_REDIS_MEMORY_CHECK_INTERVAL_MS
      ],
      ['performance.tracking.batchUpdateTime', serviceEnv.TRACK_BATCH_UPDATE_TIME],
      ['performance.tracking.retentionHours', serviceEnv.LLM_REQUEST_TRACKING_RETENTION_HOURS],
      ['performance.task.evalConcurrency', serviceEnv.EVAL_CONCURRENCY],
      ['performance.channel.wechatConcurrency', serviceEnv.WECHAT_CHANNEL_CONCURRENCY],
      // storage
      ['storage.downloadMode', serviceEnv.STORAGE_DOWNLOAD_URL_MODE],
      ['storage.externalEndpoint', serviceEnv.STORAGE_EXTERNAL_ENDPOINT],
      ['storage.cdnEndpoint', serviceEnv.STORAGE_S3_CDN_ENDPOINT],
      ['storage.fileUrlExpiredDays', serviceEnv.FILE_URL_EXPIRED_DAYS],
      // vector
      ['vector.hnswEfSearch', serviceEnv.HNSW_EF_SEARCH],
      ['vector.hnswMaxScanTuples', serviceEnv.HNSW_MAX_SCAN_TUPLES],
      // providers
      ['providers.documentParse.customPdf.url', serviceEnv.CUSTOM_PDF_PARSE_URL],
      ['providers.documentParse.customPdf.key', serviceEnv.CUSTOM_PDF_PARSE_KEY],
      ['providers.documentParse.customPdf.somarkApiKey', serviceEnv.SOMARK_API_KEY],
      ['providers.documentParse.customPdf.doc2xKey', serviceEnv.DOC2X_KEY],
      ['providers.documentParse.customPdf.textinAppId', serviceEnv.TEXTIN_APP_ID],
      ['providers.documentParse.customPdf.textinSecretCode', serviceEnv.TEXTIN_SECRET_CODE],
      ['providers.documentParse.sangfor.extensions', serviceEnv.SANGFOR_PARSE_EXTENSIONS],
      ['providers.documentParse.sangfor.timeoutSeconds', serviceEnv.SANGFOR_PARSE_TIMEOUT_SECONDS],
      ['providers.dataSource.feishuBaseUrl', serviceEnv.FEISHU_BASE_URL],
      ['providers.dataSource.dingtalkBaseUrl', serviceEnv.DINGTALK_BASE_URL],
      ['providers.dataSource.dingtalkOapiBaseUrl', serviceEnv.DINGTALK_OAPI_BASE_URL],
      ['providers.dataSource.yuqueDatasetBaseUrl', serviceEnv.YUQUE_DATASET_BASE_URL],
      // subservice
      ['subservice.plugin.baseUrl', serviceEnv.PLUGIN_BASE_URL],
      ['subservice.plugin.token', serviceEnv.PLUGIN_TOKEN],
      ['subservice.codeSandbox.baseUrl', serviceEnv.CODE_SANDBOX_URL],
      ['subservice.codeSandbox.token', serviceEnv.CODE_SANDBOX_TOKEN],
      ['subservice.aiProxy.endpoint', serviceEnv.AIPROXY_API_ENDPOINT],
      ['subservice.aiProxy.token', serviceEnv.AIPROXY_API_TOKEN],
      ['subservice.mcp.sseProxyUrl', appEnv.SSE_MCP_SERVER_PROXY_ENDPOINT],
      ['subservice.agentSandbox.provider', serviceEnv.AGENT_SANDBOX_PROVIDER],
      ['subservice.agentSandbox.common.cpuCount', serviceEnv.AGENT_SANDBOX_CPU_COUNT],
      ['subservice.agentSandbox.common.memoryMiB', serviceEnv.AGENT_SANDBOX_MEMORY_MIB],
      ['subservice.agentSandbox.common.storageSizeGi', serviceEnv.AGENT_SANDBOX_STORAGE_SIZE_GI],
      ['subservice.agentSandbox.common.suspendMinutes', serviceEnv.AGENT_SANDBOX_SUSPEND_MINUTES],
      [
        'subservice.agentSandbox.common.archiveInactiveDays',
        serviceEnv.AGENT_SANDBOX_ARCHIVE_INACTIVE_DAYS
      ],
      ['subservice.agentSandbox.common.maxEditDebug', serviceEnv.AGENT_SANDBOX_MAX_EDIT_DEBUG],
      [
        'subservice.agentSandbox.common.entrypointTimeoutSeconds',
        serviceEnv.AGENT_SANDBOX_ENTRYPOINT_TIMEOUT_SECONDS
      ],
      [
        'subservice.agentSandbox.common.wsMaxMessageBytes',
        serviceEnv.AGENT_SANDBOX_WS_MAX_MESSAGE_BYTES
      ],
      [
        'subservice.agentSandbox.common.wsMaxFrameBytes',
        serviceEnv.AGENT_SANDBOX_WS_MAX_FRAME_BYTES
      ],
      ['subservice.agentSandbox.common.npmRegistry', serviceEnv.AGENT_SANDBOX_NPM_REGISTRY],
      ['subservice.agentSandbox.common.pypiIndexUrl', serviceEnv.AGENT_SANDBOX_PYPI_INDEX_URL],
      ['subservice.agentSandbox.common.aptMirror', serviceEnv.AGENT_SANDBOX_APT_MIRROR],
      ['subservice.agentSandbox.sealosdevbox.baseUrl', serviceEnv.AGENT_SANDBOX_SEALOS_BASEURL],
      ['subservice.agentSandbox.sealosdevbox.token', serviceEnv.AGENT_SANDBOX_SEALOS_TOKEN],
      [
        'subservice.agentSandbox.sealosdevbox.workDirectory',
        serviceEnv.AGENT_SANDBOX_SEALOS_WORK_DIRECTORY
      ],
      ['subservice.agentSandbox.sealosdevbox.image', serviceEnv.AGENT_SANDBOX_SEALOS_IMAGE],
      ['subservice.agentSandbox.opensandbox.baseUrl', serviceEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL],
      ['subservice.agentSandbox.opensandbox.apiKey', serviceEnv.AGENT_SANDBOX_OPENSANDBOX_API_KEY],
      ['subservice.agentSandbox.opensandbox.runtime', serviceEnv.AGENT_SANDBOX_OPENSANDBOX_RUNTIME],
      ['subservice.agentSandbox.opensandbox.image', serviceEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE],
      [
        'subservice.agentSandbox.opensandbox.useServerProxy',
        serviceEnv.AGENT_SANDBOX_OPENSANDBOX_USE_SERVER_PROXY
      ],
      [
        'subservice.agentSandbox.opensandbox.volumeManagerUrl',
        serviceEnv.AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL
      ],
      [
        'subservice.agentSandbox.opensandbox.volumeManagerToken',
        serviceEnv.AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_TOKEN
      ],
      [
        'subservice.agentSandbox.opensandbox.volumeNamePrefix',
        serviceEnv.AGENT_SANDBOX_OPENSANDBOX_VOLUME_NAME_PREFIX
      ],
      ['subservice.agentSandbox.proxy.wsUrl', serviceEnv.AGENT_SANDBOX_PROXY_URL],
      ['subservice.agentSandbox.proxy.httpUrl', serviceEnv.AGENT_SANDBOX_PREVIEW_PROXY_URL]
    ];

    // 兜底：有取值才能验证绑定，条数过少说明表格被削掉了
    expect(
      cases.filter(([, expected]) => expected !== undefined && expected !== '').length
    ).toBeGreaterThanOrEqual(75);

    const mismatched = cases
      .filter(([path, expected]) => {
        const actual = pick(overrides, path);
        // 空字符串 env 按未配置处理、不写覆盖项（由「drops empty strings」用例覆盖），
        // 因此这类取值断言"应缺省"而不是等值
        return expected === '' ? actual !== undefined : actual !== expected;
      })
      .map(
        ([path, expected]) =>
          `${path}: 实际 ${JSON.stringify(pick(overrides, path))} != ${JSON.stringify(expected)}`
      );

    expect(mismatched).toEqual([]);
  });
});
