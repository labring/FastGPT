import { z } from 'zod';
import { TeamMemberStatusEnum } from '../../../../support/user/team/constant';
import { SourceMemberSchema } from '../../../../support/user/type';
import {
  AgentSkillCategorySchema,
  AgentSkillCreationStatusSchema,
  AgentSkillListItemSchema,
  AgentSkillSourceSchema,
  AgentSkillTypeSchema,
  ExtractedSkillPackageSchema,
  SandboxProviderStatusSchema,
  SkillPackageSchema,
  ZipEntryInfoSchema
} from '../../../../core/ai/skill/type';
import { SkillPermissionSchema } from '../../../../support/permission/skill/controller.schema';
import { ChatCompletionMessageParamSchema } from '../../../../core/ai/llm/type';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import {
  CollaboratorListSchema,
  CollaboratorUpdateListSchema
} from '../../../../support/permission/collaborator.schema';

const IdSchema = z.string().min(1).meta({ description: '资源 ID' });
const SandboxInstanceKeySchema = z.string().min(1).describe('FastGPT sandbox instance key');
const NullableParentIdSchema = z.string().nullable().optional().meta({
  description: '父级目录 ID'
});

export const ListSkillsQuerySchema = z.object({
  source: z.enum(['store', 'mine']).optional().describe('技能来源: store=系统技能, mine=我的技能'),
  searchKey: z.string().optional().describe('搜索关键词'),
  category: AgentSkillCategorySchema.optional().describe('技能分类'),
  type: AgentSkillTypeSchema.optional().describe('技能类型过滤'),
  skillIds: z.array(IdSchema).optional().describe('按技能 ID 列表过滤，用于校验已关联技能状态'),
  parentId: NullableParentIdSchema,
  page: z.coerce.number().int().positive().optional().describe('页码'),
  pageSize: z.coerce.number().int().positive().optional().describe('每页数量'),
  withAppCount: z.boolean().optional().describe('是否返回引用应用数量')
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
  permission: SkillPermissionSchema,
  sourceMember: z
    .object({
      name: z.string(),
      avatar: z.string().nullable().optional(),
      status: z.nativeEnum(TeamMemberStatusEnum)
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
  name: z.string().trim().min(1).describe('技能名称'),
  description: z.string().optional().describe('技能描述'),
  category: z.array(AgentSkillCategorySchema).optional().describe('技能分类'),
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

/* ============================================================================
 * API: 复制技能
 * Route: POST /api/core/ai/skill/copy
 * Method: POST
 * Description: 复制指定技能及其当前版本，并返回新技能 ID
 * Tags: ['基础管理', 'Write']
 * ============================================================================ */

export const CopySkillBodySchema = z.object({
  skillId: IdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '需要复制的技能 ID'
  })
});
export type CopySkillBody = z.infer<typeof CopySkillBodySchema>;

export const CopySkillResponseSchema = z.object({
  skillId: z.string().meta({
    example: '68ad85a7463006c963799a06',
    description: '复制后生成的新技能 ID'
  })
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

/* ============================================================================
 * API: 恢复技能继承权限
 * Route: GET /api/core/ai/skill/resumeInheritPermission
 * Method: GET
 * Description: 恢复指定技能或技能文件夹的权限继承
 * Tags: ['权限管理', 'Write']
 * ============================================================================ */

export const ResumeSkillInheritPermissionQuerySchema = z.object({
  skillId: IdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '需要恢复权限继承的技能或技能文件夹 ID'
  })
});
export type ResumeSkillInheritPermissionQuery = z.infer<
  typeof ResumeSkillInheritPermissionQuerySchema
>;

export const ResumeSkillInheritPermissionResponseSchema = z.undefined().meta({
  description: '恢复权限继承成功'
});
export type ResumeSkillInheritPermissionResponse = z.infer<
  typeof ResumeSkillInheritPermissionResponseSchema
>;

/* ============================================================================
 * API: 转让技能所有权
 * Route: POST /api/proApi/core/ai/skill/changeOwner
 * Method: POST
 * Description: 将技能所有权转让给指定团队成员。
 * Tags: ['资源权限', '权限管理']
 * ============================================================================ */

export const ChangeSkillOwnerBodySchema = z
  .object({
    skillId: IdSchema.meta({
      example: '68ad85a7463006c963799a05',
      description: '技能 ID'
    }),
    ownerId: ObjectIdSchema.meta({
      example: '68ad85a7463006c963799a06',
      description: '新的所有者团队成员 ID'
    })
  })
  .meta({
    example: {
      skillId: '68ad85a7463006c963799a05',
      ownerId: '68ad85a7463006c963799a06'
    }
  });
export type ChangeSkillOwnerBody = z.infer<typeof ChangeSkillOwnerBodySchema>;

export const ChangeSkillOwnerResponseSchema = z.undefined().meta({ description: '转让成功' });
export type ChangeSkillOwnerResponse = z.infer<typeof ChangeSkillOwnerResponseSchema>;

/* ============================================================================
 * API: 获取技能协作者列表
 * Route: GET /api/proApi/core/ai/skill/collaborator/list
 * Method: GET
 * Description: 获取技能协作者列表，包含继承权限场景下的父级协作者信息。
 * Tags: ['协作者管理', '权限管理']
 * ============================================================================ */

export const GetSkillCollaboratorListQuerySchema = z.object({
  skillId: IdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '技能 ID'
  })
});
export type GetSkillCollaboratorListQuery = z.infer<typeof GetSkillCollaboratorListQuerySchema>;

export const GetSkillCollaboratorListResponseSchema = CollaboratorListSchema;
export type GetSkillCollaboratorListResponse = z.infer<
  typeof GetSkillCollaboratorListResponseSchema
>;

/* ============================================================================
 * API: 更新技能协作者
 * Route: POST /api/proApi/core/ai/skill/collaborator/update
 * Method: POST
 * Description: 覆盖更新技能的协作者权限。
 * Tags: ['协作者管理', '权限管理']
 * ============================================================================ */

export const UpdateSkillCollaboratorBodySchema = z
  .object({
    skillId: IdSchema.meta({
      example: '68ad85a7463006c963799a05',
      description: '技能 ID'
    }),
    collaborators: CollaboratorUpdateListSchema.meta({
      description: '更新后的协作者权限列表，至少包含一个协作者且目标不可重复'
    })
  })
  .meta({
    example: {
      skillId: '68ad85a7463006c963799a05',
      collaborators: [
        {
          tmbId: '68ad85a7463006c963799a06',
          permission: 4
        }
      ]
    }
  });
export type UpdateSkillCollaboratorBody = z.infer<typeof UpdateSkillCollaboratorBodySchema>;

export const UpdateSkillCollaboratorResponseSchema = z.undefined().meta({
  description: '操作成功'
});
export type UpdateSkillCollaboratorResponse = z.infer<typeof UpdateSkillCollaboratorResponseSchema>;

export const GetSkillDetailResponseSchema = z.object({
  _id: z.string(),
  source: AgentSkillSourceSchema,
  type: AgentSkillTypeSchema.optional(),
  parentId: z.string().nullable().optional(),
  inheritPermission: z.boolean().optional(),
  name: z.string(),
  description: z.string(),
  category: z.array(AgentSkillCategorySchema),
  avatar: z.string().optional(),
  creationStatus: AgentSkillCreationStatusSchema.optional(),
  creationError: z.string().optional(),
  teamId: z.string().optional(),
  tmbId: z.string().optional(),
  currentVersionId: z.string().optional(),
  createTime: z.string(),
  updateTime: z.string(),
  permission: SkillPermissionSchema,
  appCount: z.number().optional()
});
export type GetSkillDetailResponse = z.infer<typeof GetSkillDetailResponseSchema>;

export const ImportSkillQuerySchema = z.object({
  filename: z.string().min(1).describe('上传的 .zip 文件原始文件名'),
  parentId: z.string().nullable().optional().describe('导入的目标目录 ID'),
  name: z.string().optional().describe('导入后的技能名称'),
  description: z.string().optional().describe('导入后的技能描述'),
  avatar: z.string().optional().describe('导入后的技能头像')
});
export type ImportSkillQuery = z.infer<typeof ImportSkillQuerySchema>;

export const ImportSkillResponseSchema = IdSchema;
export type ImportSkillResponse = z.infer<typeof ImportSkillResponseSchema>;

export const SkillRuntimeBodySchema = z.object({
  skillId: IdSchema.describe('技能 ID')
});
export type SkillRuntimeBody = z.infer<typeof SkillRuntimeBodySchema>;

export const SkillRuntimeInitEventSchema = z
  .object({
    sandboxId: z.string().describe('FastGPT sandbox instance key'),
    phase: z.string().describe('Sandbox 初始化阶段'),
    message: z.string().optional().describe('阶段消息或错误信息')
  })
  .describe('Skill Edit runtime init SSE sandboxStatus event');
export type SkillRuntimeInitEvent = z.infer<typeof SkillRuntimeInitEventSchema>;

export const GetSandboxInfoQuerySchema = z.object({
  sandboxId: SandboxInstanceKeySchema
});
export type GetSandboxInfoQuery = z.infer<typeof GetSandboxInfoQuerySchema>;

export const GetSandboxInfoResponseSchema = z.object({
  sandboxId: SandboxInstanceKeySchema,
  skillId: z.string(),
  type: z.string(),
  status: SandboxProviderStatusSchema.pick({
    state: true,
    message: true
  }),
  createTime: z.string()
});
export type GetSandboxInfoResponse = z.infer<typeof GetSandboxInfoResponseSchema>;

export const DeleteSandboxBodySchema = z.object({
  sandboxId: SandboxInstanceKeySchema
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
  versionId: z.string(),
  versionName: z.string(),
  storageKey: z.string(),
  createdAt: z.string()
});
export type SaveDeploySkillResponse = z.infer<typeof SaveDeploySkillResponseSchema>;

export { ExtractedSkillPackageSchema, SkillPackageSchema, ZipEntryInfoSchema };
export type {
  ExtractedSkillPackage,
  SkillPackageType,
  ZipEntryInfo
} from '../../../../core/ai/skill/type';

export const SkillDebugChatBodySchema = z.object({
  skillId: IdSchema,
  chatId: z.string().min(1),
  responseChatItemId: z.string().optional(),
  messages: z.array(ChatCompletionMessageParamSchema),
  modelId: z.string().meta({ description: '调试使用的模型 ID' }),
  systemPrompt: z.string().optional()
});
export type SkillDebugChatBody = z.infer<typeof SkillDebugChatBodySchema>;

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
  updateTime: z.coerce.date(),
  sourceMember: z.object({
    name: z.string(),
    avatar: z.string().nullable().optional(),
    status: z.string()
  })
});
export type AppsBySkillIdItem = z.infer<typeof AppsBySkillIdItemSchema>;

export const ListAppsBySkillIdResponseSchema = z.object({
  list: z.array(AppsBySkillIdItemSchema),
  hiddenCount: z.number().int().nonnegative().describe('当前用户无权限查看的引用应用数量')
});
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

export const ListSkillVersionsBodySchema = z.object({
  skillId: IdSchema,
  pageNum: z.number().int().positive().optional().describe('页码，从 1 开始'),
  pageSize: z.number().int().positive().describe('每页数量'),
  isCurrent: z.boolean().optional().describe('筛选是否为当前版本')
});
export type ListSkillVersionsBody = z.infer<typeof ListSkillVersionsBodySchema>;

export const SkillVersionListItemSchema = z.object({
  _id: z.string(),
  skillId: z.string(),
  tmbId: z.string(),
  sourceMember: SourceMemberSchema.meta({ description: '发布该版本的成员信息' }),
  versionName: z.string().optional(),
  isCurrent: z.boolean().describe('是否为 skill 主表标记的当前版本'),
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
