import z from 'zod';
import { ObjectIdSchema } from '../../../../../common/type/mongo';
import { GroupMemberRole } from '../../../../../support/permission/memberGroup/constant';
import { PermissionSchema } from '../../../../../support/permission/controller';

const GroupIdSchema = ObjectIdSchema.meta({
  example: '68ad85a7463006c963799a07',
  description: '群组 ID'
});

const TeamMemberIdSchema = ObjectIdSchema.meta({
  example: '68ad85a7463006c963799a06',
  description: '团队成员 ID'
});

const EmptyQuerySchema = z.object({}).meta({ description: '该接口不需要查询参数' });

const GroupMemberRoleSchema = z.enum(GroupMemberRole).meta({
  example: GroupMemberRole.member,
  description: '成员在群组中的角色'
});

const GroupMemberPreviewSchema = z
  .object({
    tmbId: TeamMemberIdSchema,
    name: z.string().meta({ description: '成员名称' }),
    avatar: z.string().nullish().meta({ description: '成员头像' })
  })
  .meta({ description: '群组成员预览信息' });

/* ============================================================================
 * API: 转让群组所有权
 * Route: PUT /api/proApi/support/user/team/group/changeOwner
 * Method: PUT
 * Description: 将群组所有权转让给指定的团队成员。
 * Tags: ['群组管理', '团队管理', 'Write']
 * ============================================================================ */

export const ChangeGroupOwnerBodySchema = z
  .object({
    groupId: GroupIdSchema,
    tmbId: TeamMemberIdSchema
  })
  .meta({
    example: {
      groupId: '68ad85a7463006c963799a07',
      tmbId: '68ad85a7463006c963799a06'
    }
  });
export type ChangeGroupOwnerBodyType = z.infer<typeof ChangeGroupOwnerBodySchema>;

export const ChangeGroupOwnerResponseSchema = z.undefined().meta({
  description: '群组所有权转让成功'
});
export type ChangeGroupOwnerResponseType = z.infer<typeof ChangeGroupOwnerResponseSchema>;

/* ============================================================================
 * API: 创建群组
 * Route: POST /api/proApi/support/user/team/group/create
 * Method: POST
 * Description: 在当前团队中创建群组，创建者自动成为群组所有者。
 * Tags: ['群组管理', '团队管理', 'Write']
 * ============================================================================ */

export const CreateGroupBodySchema = z
  .object({
    name: z.string().optional().meta({
      example: '研发组',
      description: '群组名称，不能为空'
    }),
    avatar: z.string().optional().meta({
      example: 'https://example.com/group-avatar.png',
      description: '群组头像 URL'
    }),
    memberIdList: z
      .array(TeamMemberIdSchema)
      .optional()
      .meta({
        example: ['68ad85a7463006c963799a06'],
        description: '初始成员 ID 列表；当前创建逻辑仅自动添加创建者'
      })
  })
  .default({})
  .meta({
    description: '创建群组参数；名称为空时由业务层返回群组名称为空错误',
    example: {
      name: '研发组',
      avatar: 'https://example.com/group-avatar.png'
    }
  });
export type CreateGroupBodyType = z.infer<typeof CreateGroupBodySchema>;

export const CreateGroupResponseSchema = z.undefined().meta({
  description: '群组创建成功'
});
export type CreateGroupResponseType = z.infer<typeof CreateGroupResponseSchema>;

/* ============================================================================
 * API: 删除群组
 * Route: DELETE /api/proApi/support/user/team/group/delete
 * Method: DELETE
 * Description: 删除指定群组及其成员关系和关联权限，默认群组不可删除。
 * Tags: ['群组管理', '团队管理', 'Delete']
 * ============================================================================ */

export const DeleteGroupQuerySchema = z.object({
  groupId: z.string().optional().meta({
    example: '68ad85a7463006c963799a07',
    description: '群组 ID；缺少时由业务层返回参数缺失错误'
  })
});
export type DeleteGroupQueryType = z.infer<typeof DeleteGroupQuerySchema>;

export const DeleteGroupResponseSchema = z.undefined().meta({
  description: '群组删除成功'
});
export type DeleteGroupResponseType = z.infer<typeof DeleteGroupResponseSchema>;

/* ============================================================================
 * API: 获取群组列表
 * Route: POST /api/proApi/support/user/team/group/list
 * Method: POST
 * Description: 获取当前团队群组列表，可按名称搜索并选择是否返回成员预览和权限信息。
 * Tags: ['群组管理', '团队管理', 'Read']
 * ============================================================================ */

export const ListGroupBodySchema = z
  .object({
    searchKey: z.string().optional().meta({
      example: '研发',
      description: '按群组名称搜索'
    }),
    withMembers: z.boolean().optional().meta({
      example: true,
      description: '是否返回群组成员预览、成员数量、所有者和权限信息'
    })
  })
  .default({});
export type ListGroupBodyType = z.infer<typeof ListGroupBodySchema>;
export const ListGroupQuerySchema = EmptyQuerySchema;
export type ListGroupQueryType = z.infer<typeof ListGroupQuerySchema>;

export const GroupListItemSchema = z
  .object({
    _id: GroupIdSchema,
    teamId: ObjectIdSchema.meta({ description: '所属团队 ID' }),
    name: z.string().meta({ description: '群组名称' }),
    avatar: z.string().nullish().meta({ description: '群组头像 URL' }),
    updateTime: z.coerce.date().meta({
      example: '2026-01-02T00:00:00.000Z',
      description: '群组更新时间'
    }),
    members: z.array(GroupMemberPreviewSchema).optional().meta({
      description: '群组成员预览列表，最多返回 3 个成员'
    }),
    count: z.number().int().nonnegative().optional().meta({
      example: 12,
      description: '群组成员数量'
    }),
    owner: GroupMemberPreviewSchema.optional().meta({ description: '群组所有者' }),
    permission: PermissionSchema.optional().meta({ description: '当前用户在群组中的权限' })
  })
  .meta({ description: '群组列表项' });

export const ListGroupResponseSchema = z.array(GroupListItemSchema);
export type ListGroupResponseType = z.infer<typeof ListGroupResponseSchema>;

/* ============================================================================
 * API: 更新群组
 * Route: PUT /api/proApi/support/user/team/group/update
 * Method: PUT
 * Description: 更新群组名称、头像及成员角色；变更所有者或管理员角色需要群组所有者权限。
 * Tags: ['群组管理', '团队管理', 'Write']
 * ============================================================================ */

const GroupMemberUpdateSchema = z
  .object({
    tmbId: TeamMemberIdSchema,
    role: GroupMemberRoleSchema
  })
  .meta({ description: '群组成员及其角色' });

export const UpdateGroupBodySchema = z
  .object({
    groupId: GroupIdSchema.optional().meta({
      description: '群组 ID；缺少时由业务层返回参数缺失错误'
    }),
    name: z.string().optional().meta({
      example: '新研发组名称',
      description: '新的群组名称'
    }),
    avatar: z.string().optional().meta({
      example: 'https://example.com/new-group-avatar.png',
      description: '新的群组头像 URL'
    }),
    memberList: z.array(GroupMemberUpdateSchema).optional().meta({
      description: '完整群组成员及角色列表；传入后会覆盖原有成员关系'
    })
  })
  .default({});
export type UpdateGroupBodyType = z.infer<typeof UpdateGroupBodySchema>;

export const UpdateGroupResponseSchema = z.undefined().meta({
  description: '群组更新成功'
});
export type UpdateGroupResponseType = z.infer<typeof UpdateGroupResponseSchema>;
