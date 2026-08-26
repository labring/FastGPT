import z from 'zod';
import { ObjectIdSchema } from '../../common/type/mongo';
import { PermissionSchema } from './controller';
import type {
  CollaboratorItemDetailType,
  CollaboratorItemType,
  CollaboratorListType
} from './collaborator';

const CollaboratorTargetShape = {
  tmbId: ObjectIdSchema.optional().meta({
    example: '68ad85a7463006c963799a06',
    description: '授权给单个团队成员时使用的成员 ID'
  }),
  groupId: ObjectIdSchema.optional().meta({
    example: '68ad85a7463006c963799a07',
    description: '授权给成员组时使用的成员组 ID'
  }),
  orgId: ObjectIdSchema.optional().meta({
    example: '68ad85a7463006c963799a08',
    description: '授权给组织节点时使用的组织 ID'
  })
};

export const CollaboratorTargetSchema = z
  .object(CollaboratorTargetShape)
  .refine(({ tmbId, groupId, orgId }) => [tmbId, groupId, orgId].filter(Boolean).length === 1, {
    message: 'tmbId, groupId or orgId is required, and only one can be provided'
  })
  .meta({ description: '协作者目标；团队成员、成员组和组织节点必须且只能指定一个' });
export type CollaboratorTargetType = z.infer<typeof CollaboratorTargetSchema>;

export const CollaboratorItemSchema = CollaboratorTargetSchema.safeExtend({
  permission: z.number().int().nonnegative().meta({
    example: 4,
    description: '权限角色值'
  })
}).meta({
  description: '协作者权限配置'
}) as z.ZodType<CollaboratorItemType>;

/** 更新 ACL 时拒绝同一目标重复出现。 */
export const CollaboratorUpdateListSchema = z
  .array(CollaboratorItemSchema)
  .min(1)
  .superRefine((collaborators, ctx) => {
    const seenIds = new Set<string>();

    collaborators.forEach((collaborator, index) => {
      const collaboratorId = collaborator.tmbId ?? collaborator.groupId ?? collaborator.orgId;
      if (!collaboratorId || seenIds.has(collaboratorId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index],
          message: 'The collaborator target must be unique'
        });
        return;
      }
      seenIds.add(collaboratorId);
    });
  });

export const CollaboratorItemDetailSchema = CollaboratorTargetSchema.safeExtend({
  teamId: ObjectIdSchema.meta({ description: '团队 ID' }),
  permission: PermissionSchema,
  name: z.string().meta({ description: '协作者名称' }),
  avatar: z.string().meta({ description: '协作者头像' })
}).meta({
  description: '协作者详情'
}) as z.ZodType<CollaboratorItemDetailType>;

export const CollaboratorListSchema = z
  .object({
    clbs: z.array(CollaboratorItemDetailSchema).meta({ description: '当前资源协作者列表' }),
    parentClbs: z
      .array(CollaboratorItemDetailSchema)
      .optional()
      .meta({ description: '父级资源协作者列表' })
  })
  .meta({
    description: '资源协作者列表，包含当前资源和可继承的父级资源协作者'
  }) as z.ZodType<CollaboratorListType>;
