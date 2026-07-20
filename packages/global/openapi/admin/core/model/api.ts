import z from 'zod';
import { IntSchema } from '../../../../common/zod';
import { ChannelListItemSchema } from '../../../core/ai/channel/api';

/**
 * Pro Admin model management schemas (design §11.2).
 *
 * root-only endpoints: full-platform model/channel/usage views with team and
 * creator resolution (cross-collection JOIN: tmbId -> MongoTeamMember ->
 * MongoUser, teamId -> MongoTeam).
 */

// ═══ POST /api/admin/routes/models/getModels ═══
export const AdminGetModelsQuerySchema = z.object({
  pageNum: IntSchema.optional().default(1).meta({ description: '页码，从 1 开始', example: 1 }),
  pageSize: IntSchema.optional().default(20).meta({ description: '每页条数', example: 20 }),
  offset: IntSchema.optional().meta({ description: '偏移量（与 pageNum 二选一）', example: 0 }),
  search: z.string().optional().meta({ description: '按 modelId/model/name 搜索' }),
  provider: z.string().optional().meta({ description: '按提供商过滤' }),
  type: z
    .string()
    .optional()
    .meta({ description: '按模型类型过滤（llm/embedding/tts/stt/rerank）' }),
  isActive: z.enum(['active', 'inactive']).optional().meta({ description: '按启用状态过滤' }),
  teamId: z.string().optional().meta({ description: '按团队过滤（团队 ID 或团队名）' }),
  tmbId: z.string().optional().meta({ description: '按创建人过滤（成员 ID 或用户名）' })
});
export type AdminGetModelsQuery = z.infer<typeof AdminGetModelsQuerySchema>;

export const AdminModelListItemSchema = z.object({
  id: z
    .string()
    .meta({ description: 'Model configuration ID', example: '68ad85a7463006c963799a05' }),
  model: z.string().meta({ description: '上游模型名' }),
  name: z.string().meta({ description: '平台展示名' }),
  type: z.string().meta({ description: '模型类型' }),
  provider: z.string().meta({ description: '提供商' }),
  avatar: z.string().optional().meta({ description: 'Model provider avatar URL' }),
  isActive: z.boolean().meta({ description: 'Whether the model is enabled', example: true }),
  isSystem: z.boolean().meta({ description: 'Whether this is a system model', example: false }),
  teamName: z.string().nullable().optional().meta({ description: '团队名（系统模型为 null）' }),
  tmbName: z
    .string()
    .nullable()
    .optional()
    .meta({ description: '创建人用户名（系统模型为 null）' }),
  channelCount: z.number().meta({ description: '关联渠道数（同归属桶内模型名匹配数）' }),
  createdAt: z.string().optional().meta({ description: 'Creation time in ISO 8601 format' }),
  updatedAt: z.string().optional().meta({ description: 'Last update time in ISO 8601 format' })
});
export type AdminModelListItem = z.infer<typeof AdminModelListItemSchema>;

export const AdminGetModelsResponseSchema = z.object({
  total: z.number().meta({ description: 'Total matching model configurations' }),
  list: z
    .array(AdminModelListItemSchema)
    .meta({ description: 'Model configurations on this page' }),
  pageNum: z.number().optional().meta({ description: 'Current page number', example: 1 }),
  pageSize: z.number().optional().meta({ description: 'Number of items per page', example: 20 })
});
export type AdminGetModelsResponse = z.infer<typeof AdminGetModelsResponseSchema>;

// ═══ POST /api/admin/routes/models/getChannels ═══
export const AdminGetChannelsQuerySchema = z.object({
  pageNum: IntSchema.optional().default(1).meta({ description: '页码，从 1 开始', example: 1 }),
  pageSize: IntSchema.optional().default(20).meta({ description: '每页条数', example: 20 }),
  offset: IntSchema.optional().meta({ description: '偏移量（与 pageNum 二选一）', example: 0 }),
  search: z.string().optional().meta({ description: '按渠道名或上游模型名搜索' }),
  teamId: z.string().optional().meta({ description: '按团队过滤（团队 ID 或团队名）' }),
  tmbId: z.string().optional().meta({ description: '按创建人过滤（成员 ID 或用户名）' })
});
export type AdminGetChannelsQuery = z.infer<typeof AdminGetChannelsQuerySchema>;

// Merged system + member channel view; creator is null for system channels.
export const AdminChannelListItemSchema = ChannelListItemSchema.extend({
  creator: z
    .object({
      tmbId: z.string().meta({ description: 'Creator team-member ID' }),
      username: z.string().meta({ description: 'Creator username' }),
      teamName: z.string().meta({ description: 'Creator team name' })
    })
    .nullable()
    .optional()
    .meta({ description: '成员渠道创建人；系统渠道为 null' })
});
export type AdminChannelListItem = z.infer<typeof AdminChannelListItemSchema>;

export const AdminGetChannelsResponseSchema = z.object({
  total: z.number().meta({ description: 'Total matching channels' }),
  list: z.array(AdminChannelListItemSchema).meta({ description: 'Channels on this page' })
});
export type AdminGetChannelsResponse = z.infer<typeof AdminGetChannelsResponseSchema>;

// ═══ POST /api/admin/routes/models/getUsageLogs ═══
export const AdminGetUsageLogsQuerySchema = z.object({
  pageNum: IntSchema.optional().default(1).meta({ description: '页码，从 1 开始', example: 1 }),
  pageSize: IntSchema.optional().default(20).meta({ description: '每页条数', example: 20 }),
  offset: IntSchema.optional().meta({ description: '偏移量（与 pageNum 二选一）', example: 0 }),
  search: z.string().optional().meta({ description: '按 model 名或 modelId 搜索' }),
  teamId: z.string().optional().meta({ description: '按团队过滤（团队 ID 或团队名）' }),
  tmbId: z.string().optional().meta({ description: '按创建人过滤（成员 ID 或用户名）' }),
  startTime: z.string().optional().meta({ description: '开始时间（ISO 字符串）' }),
  endTime: z.string().optional().meta({ description: '结束时间（ISO 字符串）' })
});
export type AdminGetUsageLogsQuery = z.infer<typeof AdminGetUsageLogsQuerySchema>;

export const AdminUsageLogItemSchema = z.object({
  id: z.string().meta({ description: 'Usage item ID' }),
  time: z.string().meta({ description: '调用时间（ISO 字符串）' }),
  modelId: z.string().optional().meta({ description: 'Referenced model configuration ID' }),
  model: z.string().optional().meta({ description: '记录时的上游模型名' }),
  name: z.string().optional().meta({ description: '展示名（由 modelId 解析，缺省回退 model）' }),
  type: z
    .string()
    .optional()
    .meta({ description: '模型类型（llm/embedding/...，未知为 undefined）' }),
  totalPoints: z.number().meta({ description: '积分消耗（usage_items.amount）' }),
  teamName: z.string().nullable().optional().meta({ description: 'Team name at query time' }),
  tmbName: z.string().nullable().optional().meta({ description: 'Creator username at query time' })
});
export type AdminUsageLogItem = z.infer<typeof AdminUsageLogItemSchema>;

export const AdminGetUsageLogsResponseSchema = z.object({
  total: z.number().meta({ description: 'Total matching usage items' }),
  list: z.array(AdminUsageLogItemSchema).meta({ description: 'Usage items on this page' }),
  pageNum: z.number().optional().meta({ description: 'Current page number', example: 1 }),
  pageSize: z.number().optional().meta({ description: 'Number of items per page', example: 20 })
});
export type AdminGetUsageLogsResponse = z.infer<typeof AdminGetUsageLogsResponseSchema>;

// ═══ GET /api/admin/core/dashboard/getModelStats ═══
export const AdminModelStatsResponseSchema = z.object({
  totalCount: z.number().meta({ description: '模型总数' }),
  systemCount: z.number().meta({ description: '系统模型数（isSystem: true）' }),
  teamCount: z.number().meta({ description: '团队模型数（isSystem: false）' }),
  activeCount: z.number().meta({ description: '已启用模型数' }),
  channelCount: z.number().meta({ description: '渠道总数（系统渠道 + 全量成员渠道）' }),
  byType: z.object({
    llm: z.number().meta({ description: 'LLM configuration count' }),
    embedding: z.number().meta({ description: 'Embedding model configuration count' }),
    tts: z.number().meta({ description: 'Text-to-speech model configuration count' }),
    stt: z.number().meta({ description: 'Speech-to-text model configuration count' }),
    rerank: z.number().meta({ description: 'Rerank model configuration count' })
  })
});
export type AdminModelStatsResponse = z.infer<typeof AdminModelStatsResponseSchema>;
