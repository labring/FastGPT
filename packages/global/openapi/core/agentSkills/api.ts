import { z } from 'zod';
import {
  AgentSkillCategorySchema,
  AgentSkillListItemSchema,
  AgentSkillSourceSchema,
  AgentSkillStorageSchema,
  AgentSkillTypeSchema,
  AgentSkillConfigSchema,
  ExtractedSkillPackageSchema,
  SandboxImageConfigSchema,
  SandboxProviderStatusSchema,
  SkillPackageSchema,
  SkillSandboxEndpointSchema,
  ZipEntryInfoSchema
} from '../../../core/agentSkills/type';

const IdSchema = z.string().min(1).meta({ description: '资源 ID' });
const NullableParentIdSchema = z.string().nullable().optional().meta({
  description: '父级目录 ID'
});
const LooseObjectSchema = z.object({}).catchall(z.any());

export const ListSkillsQuerySchema = z.object({
  source: z.enum(['store', 'mine']).optional().describe('技能来源: store=系统技能, mine=我的技能'),
  searchKey: z.string().optional().describe('搜索关键词'),
  category: AgentSkillCategorySchema.optional().describe('技能分类'),
  type: AgentSkillTypeSchema.optional().describe('技能类型过滤'),
  parentId: NullableParentIdSchema,
  page: z.coerce.number().int().positive().optional().describe('页码'),
  pageSize: z.coerce.number().int().positive().optional().describe('每页数量')
});
export type ListSkillsQuery = z.infer<typeof ListSkillsQuerySchema>;

export const ListSkillsResponseItemSchema = AgentSkillListItemSchema.omit({
  createTime: true,
  updateTime: true
}).extend({
  source: AgentSkillSourceSchema,
  type: AgentSkillTypeSchema,
  createTime: z.string(),
  updateTime: z.string(),
  permission: z.number().optional(),
  sourceMember: z
    .object({
      name: z.string(),
      avatar: z.string().nullable().optional(),
      status: z.string()
    })
    .optional()
});

export const ListSkillsResponseSchema = z.object({
  list: z.array(ListSkillsResponseItemSchema),
  total: z.number()
});
export type ListSkillsResponse = z.infer<typeof ListSkillsResponseSchema>;

export const CreateSkillBodySchema = z.object({
  parentId: NullableParentIdSchema,
  name: z.string().describe('技能名称'),
  description: z.string().optional().describe('技能描述'),
  requirements: z.string().optional().describe('用于 AI 生成技能的需求描述'),
  model: z.string().optional().describe('生成技能时使用的模型'),
  category: z.array(AgentSkillCategorySchema).optional().describe('技能分类'),
  config: AgentSkillConfigSchema.optional().describe('技能配置'),
  avatar: z.string().optional().describe('技能头像')
});
export type CreateSkillBody = z.infer<typeof CreateSkillBodySchema>;

export const CreateSkillResponseSchema = IdSchema;
export type CreateSkillResponse = z.infer<typeof CreateSkillResponseSchema>;

export const UpdateSkillBodySchema = z.object({
  skillId: IdSchema,
  name: z.string().optional(),
  description: z.string().optional(),
  category: z.array(AgentSkillCategorySchema).optional(),
  config: AgentSkillConfigSchema.optional(),
  avatar: z.string().optional(),
  parentId: z
    .string()
    .nullable()
    .optional()
    .describe('移动到指定文件夹，null 表示根目录，undefined 表示不移动')
});
export type UpdateSkillBody = z.infer<typeof UpdateSkillBodySchema>;

export const UpdateSkillResponseSchema = z.void();
export type UpdateSkillResponse = z.infer<typeof UpdateSkillResponseSchema>;

export const CopySkillBodySchema = z.object({
  skillId: IdSchema
});
export type CopySkillBody = z.infer<typeof CopySkillBodySchema>;

export const CopySkillResponseSchema = z.object({
  skillId: z.string()
});
export type CopySkillResponse = z.infer<typeof CopySkillResponseSchema>;

export const DeleteSkillQuerySchema = z.object({
  skillId: IdSchema
});
export type DeleteSkillQuery = z.infer<typeof DeleteSkillQuerySchema>;

export const DeleteSkillResponseSchema = z.void();
export type DeleteSkillResponse = z.infer<typeof DeleteSkillResponseSchema>;

export const GetSkillDetailQuerySchema = z.object({
  skillId: IdSchema
});
export type GetSkillDetailQuery = z.infer<typeof GetSkillDetailQuerySchema>;

export const GetSkillDetailResponseSchema = z.object({
  _id: z.string(),
  source: AgentSkillSourceSchema,
  type: AgentSkillTypeSchema.optional(),
  parentId: z.string().nullable().optional(),
  inheritPermission: z.boolean().optional(),
  name: z.string(),
  description: z.string(),
  author: z.string(),
  category: z.array(AgentSkillCategorySchema),
  config: AgentSkillConfigSchema,
  avatar: z.string().optional(),
  teamId: z.string().optional(),
  tmbId: z.string().optional(),
  createTime: z.string(),
  updateTime: z.string(),
  permission: z.any().optional(),
  appCount: z.number().optional()
});
export type GetSkillDetailResponse = z.infer<typeof GetSkillDetailResponseSchema>;

export const ImportSkillBodySchema = z.object({
  parentId: z.string().nullable().optional().describe('导入的目标目录 ID'),
  name: z.string().optional().describe('导入后的技能名称'),
  description: z.string().optional().describe('导入后的技能描述'),
  avatar: z.string().optional().describe('导入后的技能头像')
});
export type ImportSkillBody = z.infer<typeof ImportSkillBodySchema>;

export const ImportSkillResponseSchema = IdSchema;
export type ImportSkillResponse = z.infer<typeof ImportSkillResponseSchema>;

export const CreateEditDebugSandboxBodySchema = z.object({
  skillId: IdSchema,
  image: SandboxImageConfigSchema.optional()
});
export type CreateEditDebugSandboxBody = z.infer<typeof CreateEditDebugSandboxBodySchema>;

export const CreateEditDebugSandboxResponseSchema = z.object({
  sandboxId: z.string(),
  providerSandboxId: z.string(),
  endpoint: SkillSandboxEndpointSchema,
  status: SandboxProviderStatusSchema.pick({
    state: true,
    message: true
  })
});
export type CreateEditDebugSandboxResponse = z.infer<typeof CreateEditDebugSandboxResponseSchema>;

export const GetSandboxInfoQuerySchema = z.object({
  sandboxId: IdSchema
});
export type GetSandboxInfoQuery = z.infer<typeof GetSandboxInfoQuerySchema>;

export const GetSandboxInfoResponseSchema = z.object({
  sandboxId: z.string(),
  skillId: z.string(),
  sandboxType: z.string(),
  providerSandboxId: z.string(),
  endpoint: SkillSandboxEndpointSchema.optional(),
  status: SandboxProviderStatusSchema.pick({
    state: true,
    message: true
  }),
  createTime: z.string()
});
export type GetSandboxInfoResponse = z.infer<typeof GetSandboxInfoResponseSchema>;

export const DeleteSandboxBodySchema = z.object({
  sandboxId: IdSchema
});
export type DeleteSandboxBody = z.infer<typeof DeleteSandboxBodySchema>;

export const DeleteSandboxResponseSchema = z.void();
export type DeleteSandboxResponse = z.infer<typeof DeleteSandboxResponseSchema>;

export const SaveDeploySkillBodySchema = z.object({
  skillId: IdSchema,
  versionName: z.string().optional(),
  description: z.string().optional()
});
export type SaveDeploySkillBody = z.infer<typeof SaveDeploySkillBodySchema>;

export const SaveDeploySkillResponseSchema = z.object({
  skillId: z.string(),
  version: z.number(),
  versionName: z.string(),
  storage: AgentSkillStorageSchema,
  createdAt: z.string()
});
export type SaveDeploySkillResponse = z.infer<typeof SaveDeploySkillResponseSchema>;

export { ExtractedSkillPackageSchema, SkillPackageSchema, ZipEntryInfoSchema };
export type {
  ExtractedSkillPackage,
  SkillPackageType,
  ZipEntryInfo
} from '../../../core/agentSkills/type';

export const SkillDebugChatBodySchema = z.object({
  skillId: IdSchema,
  chatId: z.string(),
  responseChatItemId: z.string().optional(),
  messages: z.array(LooseObjectSchema),
  model: z.string().optional(),
  systemPrompt: z.string().optional()
});
export type SkillDebugChatBody = z.infer<typeof SkillDebugChatBodySchema>;

export const SkillDebugSessionListQuerySchema = z.object({
  skillId: IdSchema,
  pageNum: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional()
});
export type SkillDebugSessionListQuery = z.infer<typeof SkillDebugSessionListQuerySchema>;

export const SkillDebugSessionListResponseSchema = z.object({
  list: z.array(
    z.object({
      chatId: z.string(),
      title: z.string(),
      updateTime: z.string()
    })
  ),
  total: z.number()
});
export type SkillDebugSessionListResponse = z.infer<typeof SkillDebugSessionListResponseSchema>;

export const SkillDebugSessionDeleteBodySchema = z.object({
  skillId: IdSchema,
  chatId: z.string()
});
export type SkillDebugSessionDeleteBody = z.infer<typeof SkillDebugSessionDeleteBodySchema>;

export const ListAppsBySkillIdQuerySchema = z.object({
  skillId: IdSchema
});
export type ListAppsBySkillIdQuery = z.infer<typeof ListAppsBySkillIdQuerySchema>;

export const AppsBySkillIdItemSchema = z.object({
  _id: z.string(),
  name: z.string(),
  avatar: z.string(),
  intro: z.string(),
  tmbId: z.string(),
  type: z.string(),
  updateTime: z.date(),
  sourceMember: z.object({
    name: z.string(),
    avatar: z.string().nullable().optional(),
    status: z.string()
  })
});
export type AppsBySkillIdItem = z.infer<typeof AppsBySkillIdItemSchema>;

export const ListAppsBySkillIdResponseSchema = z.array(AppsBySkillIdItemSchema);
export type ListAppsBySkillIdResponse = z.infer<typeof ListAppsBySkillIdResponseSchema>;

export const CreateSkillFolderBodySchema = z.object({
  parentId: NullableParentIdSchema,
  name: z.string(),
  description: z.string().optional()
});
export type CreateSkillFolderBody = z.infer<typeof CreateSkillFolderBodySchema>;

export const CreateSkillFolderResponseSchema = z.object({
  folderId: z.string()
});
export type CreateSkillFolderResponse = z.infer<typeof CreateSkillFolderResponseSchema>;

export const GetSkillFolderPathQuerySchema = z.object({
  sourceId: z.string().optional(),
  type: z.enum(['current', 'parent'])
});
export type GetSkillFolderPathQuery = z.infer<typeof GetSkillFolderPathQuerySchema>;

export const GetSkillFolderPathResponseSchema = z.array(
  z.object({
    parentId: z.string().nullable(),
    parentName: z.string()
  })
);
export type GetSkillFolderPathResponse = z.infer<typeof GetSkillFolderPathResponseSchema>;

export const ExportSkillQuerySchema = z.object({
  skillId: IdSchema
});
export type ExportSkillQuery = z.infer<typeof ExportSkillQuerySchema>;

export const SkillDebugDeleteChatItemBodySchema = z.object({
  skillId: IdSchema,
  chatId: z.string(),
  contentId: z.string()
});
export type SkillDebugDeleteChatItemBody = z.infer<typeof SkillDebugDeleteChatItemBodySchema>;

export const SkillDebugRecordsBodySchema = z.object({
  skillId: IdSchema,
  chatId: z.string(),
  pageSize: z.coerce.number().int().positive().optional(),
  initialId: z.string().optional(),
  nextId: z.string().optional(),
  prevId: z.string().optional()
});
export type SkillDebugRecordsBody = z.infer<typeof SkillDebugRecordsBodySchema>;

export const SkillDebugRecordsResponseSchema = z.object({
  list: z.array(z.any()),
  total: z.number(),
  hasMorePrev: z.boolean(),
  hasMoreNext: z.boolean()
});
export type SkillDebugRecordsResponse = z.infer<typeof SkillDebugRecordsResponseSchema>;

export const ListSkillVersionsBodySchema = z.object({
  skillId: IdSchema,
  pageNum: z.number().int().positive().optional().describe('页码，从 1 开始'),
  pageSize: z.number().int().positive().describe('每页数量'),
  isActive: z.boolean().optional().describe('筛选是否为活跃版本')
});
export type ListSkillVersionsBody = z.infer<typeof ListSkillVersionsBodySchema>;

export const SkillVersionListItemSchema = z.object({
  _id: z.string(),
  skillId: z.string(),
  tmbId: z.string(),
  version: z.number(),
  versionName: z.string().optional(),
  isActive: z.boolean(),
  createdAt: z.string()
});
export type SkillVersionListItemType = z.infer<typeof SkillVersionListItemSchema>;

export const ListSkillVersionsResponseSchema = z.object({
  list: z.array(SkillVersionListItemSchema),
  total: z.number()
});
export type ListSkillVersionsResponse = z.infer<typeof ListSkillVersionsResponseSchema>;

export const UpdateSkillVersionBodySchema = z.object({
  skillId: IdSchema,
  versionId: IdSchema,
  versionName: z.string().describe('版本名称')
});
export type UpdateSkillVersionBody = z.infer<typeof UpdateSkillVersionBodySchema>;

export const UpdateSkillVersionResponseSchema = z.void();
export type UpdateSkillVersionResponse = z.infer<typeof UpdateSkillVersionResponseSchema>;

export const SwitchSkillVersionBodySchema = z.object({
  skillId: IdSchema,
  versionId: IdSchema
});
export type SwitchSkillVersionBody = z.infer<typeof SwitchSkillVersionBodySchema>;

export const SwitchSkillVersionResponseSchema = z.void();
export type SwitchSkillVersionResponse = z.infer<typeof SwitchSkillVersionResponseSchema>;

export const ImportSkillMultipartRequestSchema = {
  type: 'object' as const,
  properties: {
    file: {
      type: 'string' as const,
      format: 'binary' as const,
      description: '技能压缩包文件，支持 ZIP / TAR / TAR.GZ'
    },
    name: {
      type: 'string' as const,
      description: '导入后的技能名称，可选'
    },
    description: {
      type: 'string' as const,
      description: '导入后的技能描述，可选'
    },
    avatar: {
      type: 'string' as const,
      description: '导入后的技能头像，可选'
    }
  },
  required: ['file'] as string[]
};
