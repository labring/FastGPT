export const DevApiTagsMap = {
  /* 核心-应用管理 */
  appCommon: '应用基础管理',
  appFolder: '文件夹管理',
  appPer: '应用权限管理',
  appVersion: '应用版本管理',
  appTemplate: '模板管理',
  appEvaluation: '应用评测',
  appLog: '日志管理',
  publishChannel: '发布渠道',
  appOther: '其他',
  workflowDebug: '工作流调试',

  /* 核心-工具管理 */
  mcpTools: 'MCP 工具管理',
  httpTools: 'HTTP 工具管理',
  mcpServer: 'MCP 发布管理',
  appSystemTool: '系统工具',
  toolPreview: '工具节点预览',

  /* 核心-技能 */
  skillBasic: '基础管理',
  skillPermission: '权限管理',
  skillEdit: '编辑管理',
  skillDebug: '技能调试',
  skillVersion: '版本管理',

  /* 核心-AI 相关 */
  sandbox: 'AI 沙盒',
  aiCommon: 'AI 通用接口',

  /* 核心-AI 辅助生成 */
  aiAuxiliary: 'AI 辅助生成',
  workflowHelper: '工作流辅助生成',

  /* 核心-对话模块配置 */
  chatSetting: '门户页配置',
  chatPage: '对话页面配置',
  chatInputGuide: '对话输入引导',

  /* 核心-对话模块使用 */
  chatHistory: '会话管理',
  chatFeedback: '对话反馈',
  chatFile: '文件操作',
  chatRecord: '对话管理',
  chatController: '会话操作',

  /* 核心-知识库 */
  datasetCommon: '知识库管理',
  datasetPermission: '知识库权限管理',
  datasetCollection: '集合管理',
  datasetCollectionCrteate: '知识库集合创建',
  datasetData: '数据管理',
  datasetTraining: '训练管理',
  datasetApiDataset: 'API 数据集管理',
  datasetTag: '标签管理',
  datasetFile: '知识库文件管理',

  /* 核心-插件系统 */
  pluginToolTag: '工具标签',
  pluginTeam: '团队插件管理',
  pluginDebug: '插件调试',

  /* 辅助-用户体系 */
  userInform: '用户通知',
  userLogin: '用户账号',

  /* 辅助-钱包 */
  walletBill: '订单',
  walletInvoice: '发票管理',
  walletUsage: '使用记录',
  walletDiscountCoupon: '优惠券',

  /* 辅助-权限管理 */
  permissionResource: '资源权限',
  permissionCollaborator: '协作者管理',

  /* 通用-基础功能 */
  apiKey: 'API Key 管理',
  customDomain: '自定义域名',
  commonFile: '文件管理',
  commonSystem: '系统接口',
  commonOther: '基础功能其他',

  /* 通用-反向调用 */
  reverseInvokePlugin: '插件',
  reverseInvokeSandbox: '沙盒',

  /* 辅助-团队体系 */
  teamManage: '团队管理',
  userLimit: '限流检查',
  enterpriseAuth: '企业认证',
  teamPermission: '团队权限管理',
  teamInvitationLink: '邀请链接管理',
  teamMember: '成员管理',
  teamOrg: '部门管理',
  teamGroup: '群组管理',
  teamSubscription: '订阅管理',

  /* 插件市场 */
  pluginMarketplace: '插件市场-系统工具',

  /* 管理员-插件管理 */
  pluginAdmin: '管理员插件管理',
  pluginToolAdmin: '管理员系统工具管理',

  /* 管理员-系统管理 */
  adminDashboard: '仪表盘',
  adminInform: '通知管理',
  adminApps: '应用管理',
  adminWalletCoupon: '兑换码管理',
  adminUsers: '用户管理',
  adminTeams: '团队管理',
  adminDatasets: '知识库管理',
  adminPays: '订单管理',
  adminPlans: '套餐管理',
  adminSettings: '系统配置',
  adminLogs: '系统日志',
  adminLicense: '许可证管理',
  adminTemplate: '模板管理',
  adminTemplateType: '模板类型管理',
  adminWalletInvoice: '发票管理',
  adminWalletRefund: '退款管理',
  adminAuth: '管理员认证'
};

/** Scalar 文档导航中的标签展示名，key 保持 OpenAPI 内部标签唯一。 */
export const DevApiTagNameAliases: Record<string, string> = {
  [DevApiTagsMap.pluginMarketplace]: '系统工具'
};

export const SystemOpenApiTagMap = {
  appLog: 'systemOpenAPI:appLog',

  chatHistory: 'systemOpenAPI:chatHistory',
  chat: 'systemOpenAPI:chat',
  chatFeedback: 'systemOpenAPI:chatFeedback',
  chatController: 'systemOpenAPI:chatController',

  dataset: 'systemOpenAPI:dataset',
  datasetCollection: 'systemOpenAPI:datasetCollection',
  datasetCollectionCreate: 'systemOpenAPI:datasetCollectionCreate',
  datasetData: 'systemOpenAPI:datasetData',
  datasetDataIndex: 'systemOpenAPI:datasetDataIndex',
  datasetOther: 'systemOpenAPI:datasetOther'
};
