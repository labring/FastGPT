import { SubPlanSchema } from '../../../support/wallet/sub/type';
import { z } from 'zod';
import { NumSchema } from '../../zod';
import type {
  LicensePayload,
  LicenseSchemaVersionType,
  LicenseType,
  LicenseFunctions,
  LicenseFunctionKey,
  LicenseLimits
} from '../license/schema';

export type {
  LicensePayload,
  LicenseSchemaVersionType,
  LicenseType,
  LicenseFunctions,
  LicenseFunctionKey,
  LicenseLimits
};
export {
  licenseFunctionKeys,
  licenseLimitsKeys,
  LicensePayloadSchema,
  StrictLicensePayloadSchema,
  LicenseFunctionsSchema,
  LicenseLimitsSchema,
  LicenseSchemaVersionSchema,
  LicenseTypeSchema
} from '../license/schema';

export const NavbarItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatar: z.string(),
  url: z.string(),
  isActive: z.boolean()
});
export type NavbarItemType = z.infer<typeof NavbarItemSchema>;

export const ExternalProviderWorkflowVarSchema = z.object({
  name: z.string(),
  key: z.string(),
  intro: z.string(),
  isOpen: z.boolean(),
  url: z.string().optional()
});
export type ExternalProviderWorkflowVarType = z.infer<typeof ExternalProviderWorkflowVarSchema>;

export const FastGPTRegisterMethodSchema = z.enum(['email', 'phone']);
export type FastGPTRegisterMethodType = z.infer<typeof FastGPTRegisterMethodSchema>;

export const FastGPTRegisterMethodCompatSchema = z.enum(['email', 'phone', 'sync']);
export type FastGPTRegisterMethodCompatType = z.infer<typeof FastGPTRegisterMethodCompatSchema>;

export const FastGPTTeamModeSchema = z.enum(['multi', 'single', 'sync']);
export type FastGPTTeamModeType = z.infer<typeof FastGPTTeamModeSchema>;

export const FastGPTFeConfigsSchema = z.looseObject({
  show_workorder: z.boolean().optional().meta({ description: '是否展示工单入口' }),
  isPlus: z
    .boolean()
    .optional()
    .meta({ description: '商业版授权是否有效；未激活或已到期时为 false' }),
  isProService: z.boolean().optional().meta({
    description:
      '是否部署了商业版（pro）服务（配置了 PRO_URL）。与 isPlus 区别：本字段表示服务是否接入（用于区分商业版部署与开源社区版部署），而 isPlus 表示授权是否有效。'
  }),
  hideChatCopyrightSetting: z
    .boolean()
    .optional()
    .meta({ description: '是否隐藏对话版权自定义设置' }),
  register_method: z.array(FastGPTRegisterMethodCompatSchema).optional().meta({
    description: '用户自助注册方式列表（支持邮箱、手机号，兼容历史 sync 配置）'
  }),
  teamMode: FastGPTTeamModeSchema.optional().meta({
    description: '团队模式（单团队/多团队/账号同步）'
  }),
  login_method: z
    .array(FastGPTRegisterMethodSchema)
    .optional()
    .meta({ description: '支持的账号登录方式列表（邮箱、手机号）' }),
  find_password_method: z
    .array(FastGPTRegisterMethodSchema)
    .optional()
    .meta({ description: '找回密码验证方式列表' }),
  bind_notification_method: z
    .array(FastGPTRegisterMethodSchema)
    .optional()
    .meta({ description: '绑定通知联系方式列表' }),
  mcpServerProxyEndpoint: z.string().optional().meta({
    description: 'MCP SSE 代理地址，运行时配置以环境变量 SSE_MCP_SERVER_PROXY_ENDPOINT 为准'
  }),

  chineseRedirectUrl: z.string().optional().meta({ description: '中国大陆地区访问重定向跳转地址' }),
  botIframeUrl: z.string().optional().meta({ description: '嵌入式对话助手 iframe 页面地址' }),

  show_appStore: z.boolean().optional().meta({ description: '是否展示应用市场' }),
  show_git: z.boolean().optional().meta({ description: '是否展示 GitHub 仓库入口及 Star 信息' }),
  show_pay: z.boolean().optional().meta({ description: '是否展示在线充值/支付相关入口' }),
  show_openai_account: z
    .boolean()
    .optional()
    .meta({ description: '是否展示个人/团队自定义 OpenAI 账号配置入口' }),
  show_compliance_copywriting: z
    .boolean()
    .optional()
    .meta({ description: '前端是否展示合规提示文案' }),
  show_coupon: z.boolean().optional().meta({ description: '是否展示兑换码入口' }),
  show_discount_coupon: z.boolean().optional().meta({ description: '是否展示优惠券/折扣券入口' }),
  show_enterprise_auth: z.boolean().optional().meta({ description: '是否展示企业实名认证入口' }),
  showWecomConfig: z.boolean().optional().meta({ description: '是否展示企业微信集成配置' }),
  wecomLoginAutoRedirect: z
    .boolean()
    .optional()
    .meta({ description: '在企业微信内置浏览器中访问时是否自动重定向到企微 OAuth 登录' }),
  accountCancellation: z
    .looseObject({
      enabled: z.boolean().optional().meta({ description: '是否允许用户自助注销账号' })
    })
    .optional()
    .meta({ description: '账号注销配置' }),
  /** 仅暴露注销验证的布尔能力，不包含任何 Provider 密钥。 */
  accountVerification: z
    .looseObject({
      accountCancellation: z
        .looseObject({
          emailCode: z.boolean().optional().meta({ description: '注销时是否支持邮箱验证码校验' }),
          phoneCode: z
            .boolean()
            .optional()
            .meta({ description: '注销时是否支持手机短信验证码校验' }),
          accountCancellation: z
            .boolean()
            .optional()
            .meta({ description: '是否开启注销二次确认验证' }),
          wechat: z.boolean().optional().meta({ description: '注销时是否支持微信扫码验证' }),
          oauth: z
            .record(z.string(), z.boolean())
            .optional()
            .meta({ description: '注销时支持的第三方 OAuth 验证渠道' })
        })
        .optional()
    })
    .optional()
    .meta({ description: '注销账号等敏感操作的可用验证方式能力（仅暴露开关，不含密钥）' }),

  show_dataset_feishu: z
    .boolean()
    .optional()
    .meta({ description: '创建知识库时是否展示飞书知识库导入选项' }),
  show_dataset_yuque: z
    .boolean()
    .optional()
    .meta({ description: '创建知识库时是否展示语雀知识库导入选项' }),
  show_dataset_dingtalk: z
    .boolean()
    .optional()
    .meta({ description: '创建知识库时是否展示钉钉知识库导入选项' }),
  show_publish_feishu: z
    .boolean()
    .optional()
    .meta({ description: '应用发布渠道中是否展示飞书机器人' }),
  show_publish_dingtalk: z
    .boolean()
    .optional()
    .meta({ description: '应用发布渠道中是否展示钉钉机器人' }),
  show_publish_wecom: z
    .boolean()
    .optional()
    .meta({ description: '应用发布渠道中是否展示企业微信应用' }),
  show_publish_offiaccount: z
    .boolean()
    .optional()
    .meta({ description: '应用发布渠道中是否展示微信公众号' }),
  show_publish_wechat: z
    .boolean()
    .optional()
    .meta({ description: '应用发布渠道中是否展示微信个人号客服' }),
  show_agent_sandbox: z
    .boolean()
    .optional()
    .meta({ description: '是否开启 Agent 代码沙箱执行环境' }),
  pluginRemoteDebug: z.boolean().optional().meta({ description: '是否允许团队远程调试自定义插件' }),
  enable_team_plugin_upload: z
    .boolean()
    .optional()
    .meta({ description: '是否允许团队成员上传自定义插件' }),

  show_dataset_enhance: z
    .boolean()
    .optional()
    .meta({ description: '是否开启数据集增强处理能力（如文本清洗、改写）' }),
  show_batch_eval: z.boolean().optional().meta({ description: '是否开启批量评测模块' }),

  concatMd: z
    .string()
    .optional()
    .meta({ description: '自定义展示的 Markdown 文案（如开源地址、加入交流群说明）' }),
  docUrl: z.string().optional().meta({ description: '官方使用文档地址' }),
  loginGuideDocUrl: z.string().optional().meta({ description: '登录引导帮助文档地址' }),
  openAPIDocUrl: z.string().optional().meta({ description: 'OpenAPI 接口文档地址' }),
  appTemplateCourse: z.string().optional().meta({ description: '应用模板使用教程链接' }),
  marketplaceUrl: z.string().optional().meta({ description: '插件市场与模板市场服务地址' }),
  customApiDomain: z.string().optional().meta({ description: '对外开放的自定义 API 域名' }),
  customSharePageDomain: z
    .string()
    .optional()
    .meta({ description: '分享免登对话页面的自定义独立域名' }),

  systemTitle: z.string().optional().meta({ description: '系统平台标题名称' }),
  scripts: z
    .array(z.record(z.string(), z.string()))
    .optional()
    .meta({ description: '前端注入的外部第三方脚本列表' }),
  favicon: z.string().optional().meta({ description: '站点浏览器 Favicon 图标地址' }),

  sso: z
    .looseObject({
      icon: z.string().optional().meta({ description: 'SSO 登录方式图标' }),
      title: z.string().optional().meta({ description: 'SSO 登录按钮显示标题' }),
      url: z.string().optional().meta({ description: 'SSO 认证跳转地址' }),
      autoLogin: z
        .boolean()
        .optional()
        .meta({ description: '是否在首次进入页面时自动跳转 SSO 登录' })
    })
    .optional()
    .meta({ description: '企业单点登录（SSO）配置' }),
  oauth: z
    .looseObject({
      github: z.string().optional().meta({ description: 'GitHub OAuth Client ID' }),
      google: z.string().optional().meta({ description: 'Google OAuth Client ID' }),
      wechat: z.string().optional().meta({ description: '微信开放平台 AppID' }),
      microsoft: z
        .looseObject({
          clientId: z.string().optional().meta({ description: '微软 Azure AD Client ID' }),
          tenantId: z.string().optional().meta({ description: '微软 Azure AD 租户 ID' }),
          customButton: z.string().optional().meta({ description: '微软登录自定义按钮文案' })
        })
        .optional()
        .meta({ description: '微软登录配置' }),
      wecom: z.boolean().optional().meta({ description: '是否启用企业微信扫码/网页登录' })
    })
    .optional()
    .meta({ description: '第三方 OAuth 快捷登录配置' }),
  limit: z
    .looseObject({
      exportDatasetLimitMinutes: NumSchema.optional().meta({
        description: '知识库数据集导出频次限制（分钟）'
      }),
      websiteSyncLimitMinuted: NumSchema.optional().meta({
        description: '网页数据源自动同步时间间隔限制（分钟）'
      }),
      agentSandboxMaxEditDebug: NumSchema.optional().meta({
        description: '单团队 Agent 沙箱最大同时在线编辑调试数'
      }),
      agentSandboxMaxSessionRuntime: NumSchema.optional().meta({
        description: 'Agent 沙箱最大会话运行时间（毫秒）'
      }),
      agentSandboxArchiveMaxBytes: NumSchema.optional().meta({
        description: '沙箱归档文件大小限制（字节）'
      }),
      skillSandboxMaxBytes: NumSchema.optional().meta({
        description: '技能沙箱最大体积限制（字节）'
      }),
      agentSandboxMaxFileBytes: NumSchema.optional().meta({
        description: '沙箱单文件大小限制（字节）'
      }),
      workflowParallelRunMaxConcurrency: NumSchema.optional().meta({
        description: '工作流并行分支最大并发数'
      }),
      maxFolderDepth: NumSchema.optional().meta({
        description: '应用与知识库目录支持的最大嵌套深度'
      })
    })
    .optional()
    .meta({ description: '系统各项资源上限与速率限制' }),

  uploadFileMaxAmount: NumSchema.default(1000).meta({ description: '单次最多上传文件数量' }),
  uploadFileMaxSize: NumSchema.default(1000).meta({ description: '单文件最大大小限制（MB）' }),
  evalFileMaxLines: NumSchema.optional().meta({ description: '评测用例文件最大支持行数' }),

  // Compute by systemEnv.customPdfParse
  showCustomPdfParse: z.boolean().optional().meta({ description: '是否启用高精自定义 PDF 解析器' }),
  customPdfParsePrice: NumSchema.optional().meta({
    description: '自定义高精 PDF 解析按页计费单价（积分/页）'
  }),

  // 是否预置了智能分块服务地址(SANGFOR_CHUNK_URL)。未配置时 UI 隐藏「智能分块」入口。
  show_intelligent_chunking: z.boolean().optional().meta({
    description: '是否预置了智能分块服务（SANGFOR_CHUNK_URL），未配置时前端隐藏智能分块选项'
  }),

  navbarItems: z.array(NavbarItemSchema).optional().meta({ description: '自定义系统导航栏链接项' }),
  externalProviderWorkflowVariables: z.array(ExternalProviderWorkflowVarSchema).optional().meta({
    description: '外部提供商工作流全局变量定义'
  }),

  payConfig: z
    .looseObject({
      wx: z.boolean().optional().meta({ description: '是否启用微信支付' }),
      alipay: z.boolean().optional().meta({ description: '是否启用支付宝支付' }),
      bank: z.boolean().optional().meta({ description: '是否启用公对公银行转账' })
    })
    .optional()
    .meta({ description: '可用支付方式配置' }),
  payFormUrl: z.string().optional().meta({ description: '第三方定制充值页面或工单表单跳转链接' }),
  fileUrlWhitelist: z
    .array(z.string())
    .optional()
    .meta({ description: '允许外部加载的文件资源 URL 域名白名单' }),
  customDomain: z
    .looseObject({
      enable: z.boolean().optional().meta({ description: '是否开启自定义独立域名功能' }),
      domain: z
        .looseObject({
          aliyun: z.string().optional().meta({ description: '阿里云 DNS 解析域名' }),
          tencent: z.string().optional().meta({ description: '腾讯云 DNS 解析域名' }),
          volcengine: z.string().optional().meta({ description: '火山引擎 DNS 解析域名' })
        })
        .optional()
        .meta({ description: '不同云厂商 DNS 绑定域名配置' })
    })
    .optional()
    .meta({ description: '自定义独立域名绑定与 SSL 证书配置' }),

  ip_whitelist: z
    .string()
    .optional()
    .meta({ description: '系统访问限制的 IP 白名单列表（逗号分隔）' }),

  // tmp
  agentSandboxFree: z
    .boolean()
    .optional()
    .meta({ description: 'Agent 代码沙箱环境是否处于免费体验期' }),
  agentSandboxProxyUrl: z
    .string()
    .optional()
    .meta({ description: 'Agent 代码沙箱服务内网代理地址' })
});
export type FastGPTFeConfigsType = z.infer<typeof FastGPTFeConfigsSchema>;

export const CustomPdfParseSchema = z.looseObject({
  url: z.string().optional(),
  key: z.string().optional(),
  somarkApiKey: z.string().optional(),
  doc2xKey: z.string().optional(),
  textinAppId: z.string().optional(),
  textinSecretCode: z.string().optional(),
  price: NumSchema.optional()
});
export type customPdfParseType = z.infer<typeof CustomPdfParseSchema>;

export const LangfuseConfigSchema = z.looseObject({
  secretKey: z.string().optional(),
  publicKey: z.string().optional(),
  baseUrl: z.string().optional()
});
export type LangfuseConfigType = z.infer<typeof LangfuseConfigSchema>;

export const CustomDomainSchema = z.looseObject({
  kc: z
    .looseObject({
      aliyun: z.string().optional(),
      tencent: z.string().optional(),
      volcengine: z.string().optional()
    })
    .optional(),
  domain: z
    .looseObject({
      aliyun: z.string().optional(),
      tencent: z.string().optional(),
      volcengine: z.string().optional()
    })
    .optional(),
  issuerServiceName: z
    .looseObject({
      aliyun: z.string().optional(),
      tencent: z.string().optional(),
      volcengine: z.string().optional()
    })
    .optional(),
  nginxServiceName: z
    .looseObject({
      aliyun: z.string().optional(),
      tencent: z.string().optional(),
      volcengine: z.string().optional()
    })
    .optional()
});
export type customDomainType = z.infer<typeof CustomDomainSchema>;

export const SystemEnvSchema = z.looseObject({
  openapiPrefix: z.string().optional(),

  datasetParseMaxProcess: NumSchema.default(10).meta({
    description: '知识库解析最大并发处理进程数'
  }),
  vectorMaxProcess: NumSchema.default(10).meta({ description: '向量化处理最大并发进程数' }),
  qaMaxProcess: NumSchema.default(10).meta({ description: 'QA 问答对拆分最大并发进程数' }),
  vlmMaxProcess: NumSchema.default(10).meta({ description: '视觉语言模型处理最大并发进程数' }),

  hnswEfSearch: NumSchema.default(100).meta({ description: 'HNSW 向量检索 efSearch 参数' }),
  hnswMaxScanTuples: NumSchema.default(100000).meta({ description: 'HNSW 向量检索最大扫描元组数' }),
  customPdfParse: CustomPdfParseSchema.optional(),
  langfuse: LangfuseConfigSchema.optional(),
  fileUrlWhitelist: z.array(z.string()).optional(),
  customDomain: CustomDomainSchema.optional(),
  workflowHttpNode: z
    .looseObject({
      /** 是否允许工作流 HTTP 节点忽略 HTTPS 证书校验。 */
      ignoreHttpsCertificate: z.boolean().optional()
    })
    .optional()
});
export type SystemEnvType = z.infer<typeof SystemEnvSchema>;

/* fastgpt main */
export const FastGPTConfigFileSchema = z.looseObject({
  feConfigs: FastGPTFeConfigsSchema,
  systemEnv: SystemEnvSchema,
  subPlans: SubPlanSchema.optional()
});
export type FastGPTConfigFileType = z.infer<typeof FastGPTConfigFileSchema>;

/**
 * 运行时 License 数据（global.licenseData / 前端展示）=
 * 决策版 payload（schema 单一来源派生）+ deprecated 兼容视图。
 *
 * deprecated 视图（旧 UI/消费方直接读顶层字段，避免回归；新代码一律用 limits/functions 决策版键）：
 * - 顶层 maxUsers/maxApps/maxDatasets（旧结构，归一化回填自 limits）
 * - hosts（仅兼容读取，不参与校验）
 * - functions.batchEval / functions.customTemplates（旧 UI 展示兜底）
 */
export type LicenseDataType = LicensePayload & {
  hosts?: string[];
  maxUsers?: number;
  maxApps?: number;
  maxDatasets?: number;
  functions: LicenseFunctions & {
    batchEval?: boolean;
    customTemplates?: boolean;
  };
};
