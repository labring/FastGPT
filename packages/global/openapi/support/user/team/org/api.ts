import z from 'zod';
import { ObjectIdSchema } from '../../../../../common/type/mongo';
import { BoolSchema } from '../../../../../common/zod';
import { PermissionSchema } from '../../../../../support/permission/controller';

const EmptyQuerySchema = z.object({}).meta({ description: '该接口不需要查询参数' });
const OrgIdOrRootSchema = z.union([ObjectIdSchema, z.literal('')]).meta({
  example: '68ad85a7463006c963799a06',
  description: '部门 ID；空字符串表示团队根部门'
});
const DepartmentMemberSchema = z
  .object({
    tmbId: ObjectIdSchema.meta({
      example: '68ad85a7463006c963799a07',
      description: '团队成员 ID'
    })
  })
  .meta({ description: '部门成员' });

const DepartmentSchema = z
  .object({
    _id: ObjectIdSchema.meta({
      example: '68ad85a7463006c963799a06',
      description: '部门 ID'
    }),
    teamId: ObjectIdSchema.meta({
      example: '68ad85a7463006c963799a05',
      description: '团队 ID'
    }),
    pathId: z.string().meta({
      example: 'a1b2c3d4',
      description: '部门路径节点 ID'
    }),
    path: z.string().meta({
      example: '/root',
      description: '部门父级路径；根部门为空字符串'
    }),
    name: z.string().meta({
      example: '研发部',
      description: '部门名称'
    }),
    avatar: z.string().meta({
      example: 'https://example.com/department-avatar.png',
      description: '部门头像'
    }),
    description: z.string().optional().meta({
      example: '负责产品研发',
      description: '部门描述'
    }),
    updateTime: z.coerce.date().meta({
      example: '2026-01-02T00:00:00.000Z',
      description: '部门更新时间'
    }),
    permission: PermissionSchema.optional().meta({
      description: '当前用户对部门的权限；未请求权限信息时不返回'
    }),
    total: z.number().int().nonnegative().meta({
      example: 12,
      description: '部门成员和直接子部门总数'
    })
  })
  .meta({ description: '部门信息' });

/* ============================================================================
 * API: 创建部门
 * Route: POST /api/proApi/support/user/team/org/create
 * Method: POST
 * Description: 在指定父部门下创建一个新的部门。
 * Tags: ['部门管理', 'Write']
 * ============================================================================ */

export const CreateOrgBodySchema = z.object({
  name: z.string().min(1).meta({
    example: '研发部',
    description: '部门名称，不能为空'
  }),
  description: z.string().optional().meta({
    example: '负责产品研发',
    description: '部门描述'
  }),
  avatar: z.string().optional().meta({
    example: 'https://example.com/department-avatar.png',
    description: '部门头像 URL'
  }),
  orgId: OrgIdOrRootSchema.meta({
    description: '父部门 ID；空字符串表示在团队根部门下创建'
  })
});
export type CreateOrgBodyType = z.infer<typeof CreateOrgBodySchema>;

export const CreateOrgResponseSchema = z.undefined().meta({ description: '部门创建成功' });
export type CreateOrgResponseType = z.infer<typeof CreateOrgResponseSchema>;

/* ============================================================================
 * API: 删除部门
 * Route: DELETE /api/proApi/support/user/team/org/delete
 * Method: DELETE
 * Description: 删除一个空的非根部门，同时清理该部门的成员关系和资源权限。
 * Tags: ['部门管理', 'Delete']
 * ============================================================================ */

export const DeleteOrgQuerySchema = z.object({
  orgId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a06',
    description: '待删除的部门 ID；根部门不可删除'
  })
});
export type DeleteOrgQueryType = z.infer<typeof DeleteOrgQuerySchema>;

export const DeleteOrgResponseSchema = z.undefined().meta({ description: '部门删除成功' });
export type DeleteOrgResponseType = z.infer<typeof DeleteOrgResponseSchema>;

/* ============================================================================
 * API: 删除部门成员
 * Route: DELETE /api/proApi/support/user/team/org/deleteMember
 * Method: DELETE
 * Description: 将指定团队成员从部门中移除，不会将成员移出团队。
 * Tags: ['部门管理', 'Delete']
 * ============================================================================ */

export const DeleteOrgMemberQuerySchema = z.object({
  orgId: OrgIdOrRootSchema.meta({
    description: '部门 ID；空字符串表示团队根部门'
  }),
  tmbId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a07',
    description: '待移除的团队成员 ID'
  })
});
export type DeleteOrgMemberQueryType = z.infer<typeof DeleteOrgMemberQuerySchema>;

export const DeleteOrgMemberResponseSchema = z.undefined().meta({
  description: '部门成员删除成功'
});
export type DeleteOrgMemberResponseType = z.infer<typeof DeleteOrgMemberResponseSchema>;

/* ============================================================================
 * API: 获取部门列表
 * Route: POST /api/proApi/support/user/team/org/list
 * Method: POST
 * Description: 获取当前部门的直接子部门，支持按名称搜索并返回部门权限和成员数量。
 * Tags: ['部门管理', 'Read']
 * ============================================================================ */

export const ListOrgBodySchema = z.object({
  orgId: OrgIdOrRootSchema.meta({
    description: '当前部门 ID；空字符串表示从团队根部门开始查询'
  }),
  withPermission: BoolSchema.optional().meta({
    example: true,
    description: '是否返回当前用户对部门的权限信息'
  }),
  searchKey: z.string().optional().meta({
    example: '研发',
    description: '按部门名称搜索；传入后忽略层级，仅返回匹配部门'
  })
});
export type ListOrgBodyType = z.infer<typeof ListOrgBodySchema>;

export const ListOrgQuerySchema = EmptyQuerySchema;
export type ListOrgQueryType = z.infer<typeof ListOrgQuerySchema>;

export const ListOrgResponseSchema = z.array(DepartmentSchema).meta({ description: '部门列表' });
export type ListOrgResponseType = z.infer<typeof ListOrgResponseSchema>;

/* ============================================================================
 * API: 移动部门
 * Route: PUT /api/proApi/support/user/team/org/move
 * Method: PUT
 * Description: 将部门移动到新的父部门下，并同步更新该部门及其子部门的路径。
 * Tags: ['部门管理', 'Write']
 * ============================================================================ */

export const MoveOrgBodySchema = z.object({
  orgId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a06',
    description: '待移动的部门 ID'
  }),
  targetOrgId: OrgIdOrRootSchema.optional().meta({
    description: '目标父部门 ID；不传或传空字符串表示移动到团队根部门'
  })
});
export type MoveOrgBodyType = z.infer<typeof MoveOrgBodySchema>;

export const MoveOrgResponseSchema = z.undefined().meta({ description: '部门移动成功' });
export type MoveOrgResponseType = z.infer<typeof MoveOrgResponseSchema>;

/* ============================================================================
 * API: 更新部门
 * Route: PUT /api/proApi/support/user/team/org/update
 * Method: PUT
 * Description: 更新非根部门的名称、头像和描述信息。
 * Tags: ['部门管理', 'Write']
 * ============================================================================ */

export const UpdateOrgBodySchema = z.object({
  orgId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a06',
    description: '待更新的部门 ID；根部门不可更新'
  }),
  name: z.string().min(1).meta({
    example: '产品研发部',
    description: '部门名称，不能为空'
  }),
  avatar: z.string().optional().meta({
    example: 'https://example.com/department-avatar.png',
    description: '部门头像 URL'
  }),
  description: z.string().optional().meta({
    example: '负责产品和研发工作',
    description: '部门描述'
  })
});
export type UpdateOrgBodyType = z.infer<typeof UpdateOrgBodySchema>;

/* ============================================================================
 * API: 更新部门成员
 * Route: PUT /api/proApi/support/user/team/org/updateMembers
 * Method: PUT
 * Description: 全量覆盖指定部门的成员列表，传入空数组表示清空部门成员。
 * Tags: ['部门管理', 'Write']
 * ============================================================================ */

export const UpdateOrgResponseSchema = z.undefined().meta({ description: '部门更新成功' });
export type UpdateOrgResponseType = z.infer<typeof UpdateOrgResponseSchema>;

export const UpdateOrgMembersBodySchema = z.object({
  orgId: OrgIdOrRootSchema.optional().meta({
    description: '部门 ID；不传或传空字符串表示团队根部门'
  }),
  members: z.array(DepartmentMemberSchema).meta({
    description: '更新后的部门成员列表'
  })
});
export type UpdateOrgMembersBodyType = z.infer<typeof UpdateOrgMembersBodySchema>;

export const UpdateOrgMembersResponseSchema = z.undefined().meta({
  description: '部门成员更新成功'
});
export type UpdateOrgMembersResponseType = z.infer<typeof UpdateOrgMembersResponseSchema>;
