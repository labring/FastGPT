import z from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';

/* ============================================================================
 * 公共: 协作者 Schema
 * ============================================================================ */
const CollaboratorItemSchema = z.object({
  tmbId: z.string().optional().meta({ description: '团队成员 ID' }),
  groupId: z.string().optional().meta({ description: '用户组 ID' }),
  orgId: z.string().optional().meta({ description: '组织 ID' }),
  permission: z.number().meta({ description: '权限值（1=使用, 2=编辑, 4=管理, 8=所有者，可组合）' })
});

const CollaboratorItemDetailSchema = CollaboratorItemSchema.extend({
  teamId: z.string().meta({ description: '团队 ID' }),
  name: z.string().meta({ description: '名称' }),
  avatar: z.string().meta({ description: '头像' })
});

/* ============================================================================
 * API: 获取知识库协作者列表
 * Route: GET /api/core/dataset/collaborator/list
 * ============================================================================ */
export const GetDatasetCollaboratorListQuerySchema = z.object({
  datasetId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '知识库 ID'
  })
});
export type GetDatasetCollaboratorListQuery = z.infer<typeof GetDatasetCollaboratorListQuerySchema>;

export const CollaboratorListResponseSchema = z.object({
  clbs: z.array(CollaboratorItemDetailSchema).meta({ description: '有效协作者列表' }),
  parentClbs: z
    .array(CollaboratorItemDetailSchema)
    .optional()
    .meta({ description: '父级协作者列表（继承状态时存在）' })
});
export type CollaboratorListResponse = z.infer<typeof CollaboratorListResponseSchema>;

/* ============================================================================
 * API: 更新知识库协作者
 * Route: POST /api/core/dataset/collaborator/update
 * ============================================================================ */
export const UpdateDatasetCollaboratorBodySchema = z.object({
  datasetId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '知识库 ID'
  }),
  collaborators: z.array(CollaboratorItemSchema).min(1).meta({ description: '协作者列表' }),
  permissionEffectScope: z
    .enum(['allChildren', 'currentOnly'])
    .optional()
    .meta({ description: '权限生效范围：allChildren=对所有子级生效，currentOnly=仅当前资源' })
});
export type UpdateDatasetCollaboratorBody = z.infer<typeof UpdateDatasetCollaboratorBodySchema>;

/* ============================================================================
 * API: 转移知识库所有权
 * Route: POST /api/core/dataset/changeOwner
 * ============================================================================ */
export const ChangeDatasetOwnerBodySchema = z.object({
  ownerId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '新所有者的团队成员 ID'
  }),
  datasetId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a06',
    description: '知识库 ID'
  })
});
export type ChangeDatasetOwnerBody = z.infer<typeof ChangeDatasetOwnerBodySchema>;

/* ============================================================================
 * API: 获取集合协作者列表
 * Route: GET /api/core/dataset/collection/collaborator/list
 * ============================================================================ */
export const GetCollectionCollaboratorListQuerySchema = z.object({
  collectionId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '集合 ID'
  })
});
export type GetCollectionCollaboratorListQuery = z.infer<
  typeof GetCollectionCollaboratorListQuerySchema
>;

/* ============================================================================
 * API: 更新集合协作者
 * Route: POST /api/core/dataset/collection/collaborator/update
 * ============================================================================ */
export const UpdateCollectionCollaboratorBodySchema = z.object({
  collectionId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '集合 ID'
  }),
  collaborators: z.array(CollaboratorItemSchema).min(1).meta({ description: '协作者列表' }),
  permissionEffectScope: z
    .enum(['allChildren', 'currentOnly'])
    .optional()
    .meta({ description: '权限生效范围' })
});
export type UpdateCollectionCollaboratorBody = z.infer<
  typeof UpdateCollectionCollaboratorBodySchema
>;

/* ============================================================================
 * API: 批量更新集合协作者
 * Route: POST /api/core/dataset/collection/collaborator/batchUpdate
 * ============================================================================ */
export const BatchUpdateCollectionCollaboratorBodySchema = z.object({
  collectionIds: z.array(ObjectIdSchema).min(1).meta({ description: '集合 ID 列表' }),
  collaborators: z.array(CollaboratorItemSchema).min(1).meta({ description: '协作者列表' }),
  permissionEffectScope: z
    .enum(['allChildren', 'currentOnly'])
    .optional()
    .meta({ description: '权限生效范围' })
});
export type BatchUpdateCollectionCollaboratorBody = z.infer<
  typeof BatchUpdateCollectionCollaboratorBodySchema
>;

/* ============================================================================
 * API: 转移集合所有权
 * Route: POST /api/core/dataset/collection/changeOwner
 * ============================================================================ */
export const ChangeCollectionOwnerBodySchema = z.object({
  ownerId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '新所有者的团队成员 ID'
  }),
  collectionId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a06',
    description: '集合 ID'
  })
});
export type ChangeCollectionOwnerBody = z.infer<typeof ChangeCollectionOwnerBodySchema>;

/* ============================================================================
 * API: 恢复集合继承权限
 * Route: POST /api/core/dataset/collection/resumeInheritPermission
 * ============================================================================ */
export const ResumeCollectionInheritPermissionBodySchema = z.object({
  collectionId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '集合 ID'
  })
});
export type ResumeCollectionInheritPermissionBody = z.infer<
  typeof ResumeCollectionInheritPermissionBodySchema
>;
