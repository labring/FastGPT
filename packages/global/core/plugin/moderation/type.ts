import z from 'zod';
import { ChatIdSchema } from '../../chat/schema';
import {
  ModerationActionEnum,
  ModerationExceptionActionEnum,
  ModerationRiskActionEnum,
  ModerationStageEnum,
  DEFAULT_MODERATION_POLICY_CONFIG_ID
} from './constants';

export { DEFAULT_MODERATION_POLICY_CONFIG_ID };

/**
 * 内容审查插件的本地配置记录。
 *
 * 与系统工具（`MongoSystemTool`）分开存储：审查插件不是工具，不进工具列表、不进工作流节点，
 * 也没有计费、推荐标签、工具体积等字段。两者共用的只有「插件标识 + 密钥」这一概念。
 *
 * 允许多条记录同时存在，但同一时间只允许一条 `enabled === true`（互斥启用，由 service 层保证）。
 */
export const ModerationPluginConfigSchema = z.object({
  _id: z.string(),
  /** 插件 ID。与 plugin service 中的 pluginId 一致，不带 `systemTool-` 前缀 */
  pluginId: z.string(),
  /** 插件来源。系统内置为 'system'，团队安装为 'teamId:<teamId>' */
  source: z.string().optional(),
  /** 用户选择的插件版本；为空表示跟随最新版本 */
  version: z.string().optional(),
  /**
   * 是否启用。全局同一时间只允许一个插件启用，因为单次审查只以一个 provider 的裁决为准。
   * 允许多条记录存在，是为了保留多个 provider 的配置，方便切换。
   */
  enabled: z.boolean().optional(),
  /**
   * 加密后的插件配置值（厂商凭据、策略 ID 等）。
   * 读取时按 `secretSchema` 决定哪些字段脱敏，API 响应中不返回明文。
   */
  secretsVal: z.record(z.string(), z.unknown()).nullish(),
  /** Soft-uninstall marker; configuration is retained for restoration. */
  deleted: z.boolean().optional(),
  deletedAt: z.date().optional(),
  deletedByTmbId: z.string().optional(),
  createTime: z.date().optional(),
  updateTime: z.date().optional()
});
export type ModerationPluginConfigType = z.infer<typeof ModerationPluginConfigSchema>;

/**
 * 管理列表项：plugin service 的插件信息 + 本地配置合并后的展示结构。
 *
 * plugin 侧的 `ModerationDetailType` 不含任何本地状态，因此这个合并结构只能在 FastGPT 侧定义。
 */
export const AdminModerationPluginItemSchema = z.object({
  pluginId: z.string().meta({ description: '插件 ID', example: 'baidu-moderation' }),
  source: z.string().meta({ description: '插件来源', example: 'system' }),
  version: z.string().optional().meta({ description: '当前版本；为空表示未解析到' }),
  isLatestVersion: z.boolean().optional().meta({ description: '是否为最新版本' }),
  name: z.string().meta({ description: '插件名称', example: '百度内容审核' }),
  description: z.string().optional().meta({ description: '插件简介' }),
  icon: z.string().optional().meta({ description: '插件图标地址' }),
  author: z.string().optional().meta({ description: '插件作者' }),
  provider: z.string().meta({ description: 'provider 标识，来自 manifest.meta.provider' }),
  docUrl: z.string().optional().meta({ description: 'provider 文档地址' }),
  readmeUrl: z.string().optional().meta({ description: '插件 README 地址' }),
  /** 插件声明的配置项（JSON Schema），用于渲染配置表单 */
  secretSchema: z.unknown().optional().meta({ description: '配置项 JSON Schema' }),
  /** 合并后的配置值。密钥字段为脱敏占位值 */
  secretsVal: z
    .record(z.string(), z.unknown())
    .optional()
    .meta({ description: '已保存的配置值（密钥脱敏）' }),
  hasConfiguredSecrets: z
    .boolean()
    .optional()
    .meta({ description: '是否已保存过配置。用于区分「未配置」与「配置为空」' }),
  enabled: z.boolean().optional().meta({ description: '是否启用。全局同一时间只有一个插件启用' }),
  /** 是否允许在当前环境启用。插件缺失或加载失败时为 false */
  deleted: z.boolean().optional().meta({ description: '是否已卸载（保留配置可恢复）' }),
  available: z.boolean().optional().meta({ description: '插件是否可用（服务侧解析成功）' })
});
export type AdminModerationPluginItemType = z.infer<typeof AdminModerationPluginItemSchema>;

/** 全局内容审核策略 Schema */
export const SystemModerationPolicySchema = z.object({
  /** 是否开启内容审核 */
  enabled: z.boolean().default(false).meta({ description: '是否开启内容审核' }),
  /** 当前生效的审核插件 ID */
  activePluginId: z.string().optional().meta({ description: '当前生效的审核插件 ID' }),
  /** 审核生效环节 */
  hooks: z.object({
    userInput: z.boolean().default(true).meta({ description: '用户输入' }),
    modelInput: z.boolean().default(false).meta({ description: '模型输入' }),
    finalOutput: z.boolean().default(true).meta({ description: '最终输出' })
  }),
  /** 处理策略 */
  strategy: z.object({
    streamInterval: z.number().min(1).default(50).meta({ description: '流式审核间隔（字符/次）' }),
    suspectedRiskAction: z
      .enum([ModerationRiskActionEnum.blockAndLog, ModerationRiskActionEnum.passAndLog])
      .default(ModerationRiskActionEnum.blockAndLog)
      .meta({ description: '疑似风险处理方式' }),
    serviceExceptionAction: z
      .enum([ModerationExceptionActionEnum.pass, ModerationExceptionActionEnum.block])
      .default(ModerationExceptionActionEnum.pass)
      .meta({ description: '服务异常处理方式' })
  })
});
export type SystemModerationPolicyType = z.infer<typeof SystemModerationPolicySchema>;

export const DefaultSystemModerationPolicy: SystemModerationPolicyType = {
  enabled: false,
  activePluginId: undefined,
  hooks: {
    userInput: true,
    modelInput: false,
    finalOutput: true
  },
  strategy: {
    streamInterval: 50,
    suspectedRiskAction: ModerationRiskActionEnum.blockAndLog,
    serviceExceptionAction: ModerationExceptionActionEnum.pass
  }
};

/**
 * 审查记录 Schema
 *
 * 用于 MongoDB 集合 `system_moderation_records` 与管理端审计记录数据调取。
 */
export const ModerationRecordSchema = z.object({
  _id: z.string(),
  teamId: z.string().optional().meta({ description: '团队 ID' }),
  tmbId: z.string().optional().meta({ description: '操作人 ID' }),
  appId: z.string().optional().meta({ description: '应用 ID' }),
  chatId: ChatIdSchema.optional().meta({ description: '会话 ID' }),
  responseChatItemId: z.string().optional().meta({ description: '回复消息 ID' }),
  requestId: z.string().optional().meta({ description: '全局请求追踪 ID' }),

  // 1. 审核环节与上下文
  stage: z.nativeEnum(ModerationStageEnum).meta({
    description: '审核环节：信息接入平台 | 信息进入模型 | 输出检查'
  }),
  nodeId: z.string().optional().meta({ description: '触发节点 ID' }),
  nodeName: z.string().optional().meta({ description: '触发节点名称' }),
  targetField: z.string().optional().meta({
    description: '具体被审字段，如 userInput / systemPrompt / toolResult / answerText 等'
  }),

  // 2. 被审内容与结果
  content: z.string().meta({ description: '送审的文本内容（供管理端审计调取）' }),
  pluginId: z.string().optional().meta({ description: '调用的审查插件 ID' }),
  provider: z.string().optional().meta({ description: '审查服务提供商' }),
  verdict: z.enum(['pass', 'suspected', 'block', 'error']).meta({ description: '裁决结果' }),
  keywords: z.array(z.string()).default([]).meta({ description: '命中的敏感词' }),
  hits: z
    .array(
      z.object({
        label: z.string(),
        providerLabel: z.string().optional(),
        score: z.number().optional(),
        keywords: z.array(z.string()).optional()
      })
    )
    .default([]),
  errorMessage: z.string().optional(),

  // 3. 平台最终采取的执行策略与动作
  actionTaken: z.nativeEnum(ModerationActionEnum).meta({
    description: '实际执行动作：直接放行 (pass) | 拦截阻断 (block) | 替换脱敏文本 (replace)'
  }),

  duration: z.number().optional().meta({ description: '审查耗时 (ms)' }),
  createTime: z.date().default(() => new Date())
});
export type ModerationRecordType = z.infer<typeof ModerationRecordSchema>;

/**
 * 工作流节点运行详情中的内容审核拦截记录 Schema（仅对应用写权限用户可见）
 */
export const NodeModerationRecordSchema = z.object({
  stage: z.nativeEnum(ModerationStageEnum).meta({
    description: '审核环节：entry(用户输入) | model_input(传入模型) | output(展示给用户)'
  }),
  targetField: z.string().optional().meta({ description: '具体被审字段' }),
  verdict: z.enum(['pass', 'suspected', 'block', 'error']).meta({ description: '裁决结果' }),
  actionTaken: z.nativeEnum(ModerationActionEnum).meta({ description: '执行动作' }),
  hits: z
    .array(
      z.object({
        label: z.string(),
        providerLabel: z.string().optional(),
        score: z.number().optional(),
        keywords: z.array(z.string()).optional()
      })
    )
    .optional(),
  keywords: z.array(z.string()).optional(),
  content: z.string().optional().meta({ description: '被审文本原文' }),
  errorMessage: z.string().optional()
});
export type NodeModerationRecordType = z.infer<typeof NodeModerationRecordSchema>;

/** 运行时审查业务上下文（用于持久化审计与追踪） */
export type ModerationRuntimeContext = {
  teamId?: string;
  tmbId?: string;
  appId?: string;
  chatId?: string;
  responseChatItemId?: string;
  requestId?: string;
  nodeId?: string;
  nodeName?: string;
};

/** 运行时审查调用参数 */
export type CheckContentByPolicyParams = {
  /** 待审查的文本内容 */
  text: string;
  /** 审查生效环节 */
  stage: `${ModerationStageEnum}` | ModerationStageEnum;
  /** 具体被审字段 */
  targetField?: string;
  /** 全局审核策略（可选；若未传入则自动读取最新配置） */
  policy?: SystemModerationPolicyType;
  /** 违规时的实际执行动作（默认 block；当上层将违规内容替换为脱敏文本时传 replace） */
  actionOnBlock?: ModerationActionEnum.block | ModerationActionEnum.replace;
  /** 流式窗口上下文关联 ID（流式审查复用同一 sessionId） */
  sessionId?: string;
  /** 标记文本是否仍在流式增长 */
  partial?: boolean;
  /** 业务上下文（用于持久化审计与追踪） */
  context?: ModerationRuntimeContext;
};

/** 运行时审查判定结果 */
export type CheckContentByPolicyResult = {
  /** 最终执行动作：通过 (pass)、拦截 (block) 或替换 (replace) */
  action: `${ModerationActionEnum}` | ModerationActionEnum;
  /** 是否放行 */
  isPass: boolean;
  /** 送审文本内容 */
  text: string;
  /** 原始裁决结果 */
  verdict?: 'pass' | 'suspected' | 'block' | 'error';
  /** 命中敏感明细 */
  hits?: Array<{
    label: string;
    providerLabel?: string;
    score?: number;
    keywords?: string[];
  }>;
  /** 命中的敏感词列表 */
  keywords?: string[];
  /** 错误信息 */
  errorMessage?: string;
  /** 审查耗时 (ms) */
  duration?: number;
  /** 审查插件 ID */
  pluginId?: string;
  /** 审查提供商 */
  provider?: string;
};
