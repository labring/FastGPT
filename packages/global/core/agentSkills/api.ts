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
} from './type';

const IdSchema = z.string().min(1);
const NullableParentIdSchema = z.string().nullable().optional();
const LooseObjectSchema = z.object({}).catchall(z.any());

export const ListSkillsQuerySchema = z.object({
  source: z.enum(['store', 'mine']).optional(),
  searchKey: z.string().optional(),
  category: AgentSkillCategorySchema.optional(),
  parentId: NullableParentIdSchema,
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional()
});
export type ListSkillsQuery = z.infer<typeof ListSkillsQuerySchema>;

export const ListSkillsResponseItemSchema = AgentSkillListItemSchema.omit({
  createTime: true,
  updateTime: true
}).extend({
  source: AgentSkillSourceSchema,
  type: AgentSkillTypeSchema,
  createTime: z.string(),
  updateTime: z.string()
});

export const ListSkillsResponseSchema = z.object({
  list: z.array(ListSkillsResponseItemSchema),
  total: z.number()
});
export type ListSkillsResponse = z.infer<typeof ListSkillsResponseSchema>;

export const CreateSkillBodySchema = z.object({
  parentId: NullableParentIdSchema,
  name: z.string(),
  description: z.string().optional(),
  requirements: z.string().optional(),
  model: z.string().optional(),
  category: z.array(AgentSkillCategorySchema).optional(),
  config: AgentSkillConfigSchema.optional(),
  avatar: z.string().optional()
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
  avatar: z.string().optional()
});
export type UpdateSkillBody = z.infer<typeof UpdateSkillBodySchema>;

export const UpdateSkillResponseSchema = z.void();
export type UpdateSkillResponse = z.infer<typeof UpdateSkillResponseSchema>;

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
  name: z.string(),
  description: z.string(),
  author: z.string(),
  category: z.array(AgentSkillCategorySchema),
  config: AgentSkillConfigSchema,
  avatar: z.string().optional(),
  teamId: z.string().optional(),
  tmbId: z.string().optional(),
  createTime: z.string(),
  updateTime: z.string()
});
export type GetSkillDetailResponse = z.infer<typeof GetSkillDetailResponseSchema>;

export const ImportSkillBodySchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  avatar: z.string().optional()
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
export type { ExtractedSkillPackage, SkillPackageType, ZipEntryInfo } from './type';

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

export const SkillDebugRecordsBodySchema = z.object({
  skillId: IdSchema,
  chatId: z.string(),
  pageSize: z.coerce.number().int().positive().optional(),
  initialId: z.string().optional(),
  nextId: z.string().optional(),
  prevId: z.string().optional()
});
export type SkillDebugRecordsBody = z.infer<typeof SkillDebugRecordsBodySchema>;
