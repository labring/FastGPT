import z from 'zod';
import { ModerationCheckInputSchema, ModerationResultSchema } from '@fastgpt-plugin/sdk-client';
import { BoolSchema, IntSchema } from '../../../../../common/zod';
import { ModerationStageEnum } from '../../../../../core/plugin/moderation/constants';
import {
  AdminModerationPluginItemSchema,
  ModerationRecordSchema,
  SystemModerationPolicySchema
} from '../../../../../core/plugin/moderation/type';

/* ============================================================================
 * API: 获取内容审查插件列表
 * Route: GET /api/core/plugin/admin/moderation/list
 * Method: GET
 * Description: 返回 plugin service 中已安装的审查插件与本地配置合并后的列表，需要系统管理员权限
 * Tags: ['PluginAdmin', 'Read']
 * ============================================================================ */

export const GetModerationPluginListQuerySchema = z.object({
  includeDeleted: BoolSchema.optional().meta({
    description: '是否包含已卸载插件，用于恢复',
    example: true
  })
});
export type GetModerationPluginListQueryType = z.infer<typeof GetModerationPluginListQuerySchema>;

export const GetModerationPluginListResponseSchema = z.array(AdminModerationPluginItemSchema);
export type GetModerationPluginListResponseType = z.infer<
  typeof GetModerationPluginListResponseSchema
>;

/* ============================================================================
 * API: 保存内容审查插件配置
 * Route: POST /api/core/plugin/admin/moderation/config
 * Method: POST
 * Description: 同步调用插件检测配置后保存凭据、策略 ID 与启用状态，检测失败不写入。
 *              检测使用固定测试文本，可能产生厂商 API 调用费用；拦截/疑似裁决视为正常响应。
 *              启用一个插件会同时停用其他插件。需要系统管理员权限
 * Tags: ['PluginAdmin', 'Write']
 * ============================================================================ */

export const SaveModerationConfigBodySchema = z.object({
  pluginId: z.string().meta({ description: '插件 ID', example: 'baidu-moderation' }),
  version: z.string().optional().meta({ description: '指定版本；不传则使用最新版本' }),
  /**
   * 要保存的配置值。未传的字段保持原值；显式传 null 表示清空该字段。
   * 值为脱敏占位时不会被写入，避免用掩码覆盖真实密钥。
   */
  secretsVal: z
    .record(z.string(), z.unknown())
    .optional()
    .meta({ description: '插件配置值。密钥字段若要更新必须传真实值' }),
  /**
   * 是否启用。传 true 时会把其他已启用的审查插件置为停用（全局互斥）。
   * 不传表示不改变当前启用状态。
   */
  enabled: z.boolean().optional().meta({ description: '是否启用（全局互斥）' })
});
export type SaveModerationConfigBodyType = z.infer<typeof SaveModerationConfigBodySchema>;

export const SaveModerationConfigResponseSchema = AdminModerationPluginItemSchema;
export type SaveModerationConfigResponseType = z.infer<typeof SaveModerationConfigResponseSchema>;

/* ============================================================================
 * API: 测试调用内容审查插件
 * Route: POST /api/core/plugin/admin/moderation/check
 * Method: POST
 * Description: 用已保存的配置（或临时传入的 secrets）对待审文本执行一次同步审查，
 *              直接返回标准审查结构。需要系统管理员权限
 * Tags: ['PluginAdmin', 'Write']
 * ============================================================================ */

export const RawModerationCheckBodySchema = z.object({
  pluginId: z.string().meta({ description: '插件 ID' }),
  version: z.string().optional().meta({ description: '指定版本；不传则使用最新版本' }),
  /** 不传时使用该插件已保存的配置 */
  secrets: z
    .record(z.string(), z.unknown())
    .optional()
    .meta({ description: '临时覆盖的插件配置。不传则使用已保存配置' }),
  input: ModerationCheckInputSchema
});
export type RawModerationCheckBodyType = z.infer<typeof RawModerationCheckBodySchema>;

export const RawModerationCheckResponseSchema = ModerationResultSchema;
export type RawModerationCheckResponseType = z.infer<typeof RawModerationCheckResponseSchema>;

/* ============================================================================
 * API: 删除（卸装）内容审查插件
 * Route: POST /api/core/plugin/admin/moderation/delete
 * Method: POST
 * Description: 软卸载审查插件，保留本地配置供恢复。已启用的插件需先停用。需要系统管理员权限
 * Tags: ['PluginAdmin', 'Write']
 * ============================================================================ */

export const DeleteModerationPluginBodySchema = z.object({
  pluginId: z.string().meta({ description: '插件 ID' }),
  source: z.string().optional().meta({ description: '插件来源；区分同 ID 的不同来源插件' })
});
export type DeleteModerationPluginBodyType = z.infer<typeof DeleteModerationPluginBodySchema>;

/* ============================================================================
 * API: 获取全局内容审核策略
 * Route: GET /api/core/plugin/admin/moderation/policy
 * Method: GET
 * Description: 获取当前全局内容审核策略配置（生效环节、处理策略、开启状态等）。需要系统管理员权限
 * Tags: ['PluginAdmin', 'Read']
 * ============================================================================ */

export const GetModerationPolicyResponseSchema = SystemModerationPolicySchema;
export type GetModerationPolicyResponseType = z.infer<typeof GetModerationPolicyResponseSchema>;

/* ============================================================================
 * API: 更新全局内容审核策略
 * Route: POST /api/core/plugin/admin/moderation/policy
 * Method: POST
 * Description: 更新全局内容审核策略配置（生效环节、处理策略、开启状态与生效插件等）。需要系统管理员权限
 * Tags: ['PluginAdmin', 'Write']
 * ============================================================================ */

export const UpdateModerationPolicyBodySchema = SystemModerationPolicySchema;
export type UpdateModerationPolicyBodyType = z.infer<typeof UpdateModerationPolicyBodySchema>;

export const UpdateModerationPolicyResponseSchema = SystemModerationPolicySchema;
export type UpdateModerationPolicyResponseType = z.infer<
  typeof UpdateModerationPolicyResponseSchema
>;

/* ============================================================================
 * API: 分页查询内容审核记录
 * Route: POST /api/core/plugin/admin/moderation/records
 * Method: POST
 * Description: 分页查询系统内容审查持久化审计记录，支持按环节和裁决过滤。需要系统管理员权限
 * Tags: ['PluginAdmin', 'Read']
 * ============================================================================ */

export const GetModerationRecordsBodySchema = z.object({
  stage: z.nativeEnum(ModerationStageEnum).optional().meta({ description: '审核环节' }),
  verdict: z
    .enum(['pass', 'suspected', 'block', 'error'])
    .optional()
    .meta({ description: '裁决结果' }),
  offset: IntSchema.default(0).meta({ description: '分页 offset' }),
  limit: IntSchema.min(1).max(100).default(20).meta({ description: '分页 limit' })
});
export type GetModerationRecordsBodyType = z.infer<typeof GetModerationRecordsBodySchema>;

export const GetModerationRecordsResponseSchema = z.object({
  total: z.number().meta({ description: '总条数' }),
  list: z.array(ModerationRecordSchema).meta({ description: '记录列表' })
});
export type GetModerationRecordsResponseType = z.infer<typeof GetModerationRecordsResponseSchema>;

/* API: Restore moderation plugin
 * Route: POST /api/core/plugin/admin/moderation/restore
 * Method: POST
 * Description: Restore a soft-uninstalled installed plugin without enabling moderation.
 * Tags: ['PluginAdmin', 'Write']
 */
export const RestoreModerationPluginBodySchema = z.object({
  pluginId: z.string().meta({ description: '插件 ID', example: 'local-keyword-moderation' }),
  source: z.string().optional().meta({ description: '插件来源', example: 'system' })
});
export type RestoreModerationPluginBodyType = z.infer<typeof RestoreModerationPluginBodySchema>;
