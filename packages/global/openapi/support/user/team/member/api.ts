import z from 'zod';
import { ObjectIdSchema } from '../../../../../common/type/mongo';
import { GroupMemberRole } from '../../../../../support/permission/memberGroup/constant';
import { PermissionSchema } from '../../../../../support/permission/controller';
import { TeamMemberStatusEnum } from '../../../../../support/user/team/constant';
import { TeamMemberNameSchema } from '../../../../../support/user/team/memberName';
import { PaginationResponseSchema, PaginationSchema } from '../../../../api';

const TeamMemberIdSchema = ObjectIdSchema.meta({
  example: '68ad85a7463006c963799a06',
  description: '团队成员 ID'
});

const TeamMemberStatusSchema = z.enum(TeamMemberStatusEnum).meta({
  example: TeamMemberStatusEnum.active,
  description: '团队成员状态'
});

const DeprecatedTeamMemberWaitingStatusSchema = z.literal('waiting').meta({
  description: '历史版本的待接受状态，仅用于兼容历史数据，已弃用',
  deprecated: true
});

const TeamMemberListStatusSchema = z
  .union([TeamMemberStatusSchema, DeprecatedTeamMemberWaitingStatusSchema])
  .meta({
    example: TeamMemberStatusEnum.active,
    description: '团队成员状态；waiting 为历史兼容值，已弃用'
  });

/* ============================================================================
 * API: 获取团队成员数量
 * Route: GET /api/proApi/support/user/team/member/count
 * Method: GET
 * Description: 获取当前团队未离开及未停用的成员数量。
 * Tags: ['成员管理', '团队管理', 'Read']
 * ============================================================================ */

export const GetTeamMemberCountResponseSchema = z.object({
  count: z.number().int().nonnegative().meta({
    example: 10,
    description: '当前团队成员数量'
  })
});
export type GetTeamMemberCountResponseType = z.infer<typeof GetTeamMemberCountResponseSchema>;

/* ============================================================================
 * API: 删除团队成员
 * Route: DELETE /api/proApi/support/user/team/member/delete
 * Method: DELETE
 * Description: 将指定团队成员移出当前团队。
 * Tags: ['成员管理', '团队管理', 'Delete']
 * ============================================================================ */

export const DeleteTeamMemberQuerySchema = z.object({
  tmbId: TeamMemberIdSchema
});
export type DeleteTeamMemberQueryType = z.infer<typeof DeleteTeamMemberQuerySchema>;

/* ============================================================================
 * API: 导出团队成员
 * Route: GET /api/proApi/support/user/team/member/export
 * Method: GET
 * Description: 将当前团队成员信息导出为 CSV 文件。
 * Tags: ['成员管理', '团队管理', 'Read']
 * ============================================================================ */

export const ExportTeamMembersResponseSchema = z.string().meta({
  description: '导出的团队成员 CSV 文件内容'
});
export type ExportTeamMembersResponseType = z.infer<typeof ExportTeamMembersResponseSchema>;

/* ============================================================================
 * API: 离开团队
 * Route: DELETE /api/proApi/support/user/team/member/leave
 * Method: DELETE
 * Description: 当前用户主动离开当前团队，团队所有者不能执行此操作。
 * Tags: ['成员管理', '团队管理', 'Delete']
 * ============================================================================ */

/* ============================================================================
 * API: 获取团队成员列表
 * Route: POST /api/proApi/support/user/team/member/list
 * Method: POST
 * Description: 分页获取当前团队成员，支持状态、关键词、组织和成员组筛选，并可选择返回权限及组织信息。
 * Tags: ['成员管理', '团队管理', 'Read']
 * ============================================================================ */

export const ListTeamMembersBodySchema = PaginationSchema.extend({
  withPermission: z.boolean().optional().meta({
    description: '是否返回成员权限信息'
  }),
  withOrgs: z.boolean().optional().meta({
    description: '是否返回成员所属组织信息'
  }),
  searchKey: z.string().optional().meta({
    example: '张三',
    description: '按用户名、联系方式或成员名称搜索'
  }),
  groupId: ObjectIdSchema.optional().meta({
    example: '68ad85a7463006c963799a07',
    description: '按成员组 ID 筛选'
  }),
  orgId: z
    .union([ObjectIdSchema, z.literal('')])
    .optional()
    .meta({
      example: '68ad85a7463006c963799a08',
      description: '按组织 ID 筛选；空字符串表示根组织'
    }),
  status: TeamMemberStatusSchema.optional()
});
export type ListTeamMembersBodyType = z.infer<typeof ListTeamMembersBodySchema>;
export const TeamMemberListItemSchema = z
  .object({
    userId: ObjectIdSchema.meta({ description: '用户 ID' }),
    tmbId: TeamMemberIdSchema,
    teamId: ObjectIdSchema.meta({ description: '团队 ID' }),
    memberName: z.string().meta({ description: '团队成员名称' }),
    avatar: z.string().nullish().meta({ description: '团队成员头像' }),
    role: z.string().optional().meta({ description: '团队成员角色，owner 表示所有者' }),
    status: TeamMemberListStatusSchema,
    contact: z.string().nullish().meta({ description: '成员联系方式' }),
    createTime: z.coerce.date().meta({ description: '加入团队时间' }),
    updateTime: z.coerce.date().optional().meta({ description: '成员信息更新时间' }),
    permission: PermissionSchema.optional().meta({ description: '成员权限信息' }),
    orgs: z.array(z.string()).optional().meta({ description: '成员所属组织路径列表' }),
    groupRole: z.enum(GroupMemberRole).optional().meta({ description: '成员在筛选成员组中的角色' })
  })
  .meta({ description: '团队成员信息' });

export const ListTeamMembersResponseSchema = PaginationResponseSchema(TeamMemberListItemSchema);
export type ListTeamMembersResponseType = z.infer<typeof ListTeamMembersResponseSchema>;

/* ============================================================================
 * API: 恢复团队成员
 * Route: POST /api/proApi/support/user/team/member/restore
 * Method: POST
 * Description: 将指定团队成员状态恢复为 active。
 * Tags: ['成员管理', '团队管理', 'Write']
 * ============================================================================ */

export const RestoreTeamMemberBodySchema = z.object({
  tmbId: TeamMemberIdSchema.meta({ description: '需要恢复的团队成员 ID' })
});
export type RestoreTeamMemberBodyType = z.infer<typeof RestoreTeamMemberBodySchema>;

/* ============================================================================
 * API: 更新团队成员邀请状态
 * Route: PUT /api/proApi/support/user/team/member/updateInvite
 * Method: PUT
 * Description: 当前用户更新自己的团队成员邀请状态。
 * Tags: ['成员管理', '团队管理', 'Write']
 * ============================================================================ */

export const UpdateTeamMemberInviteBodySchema = z.object({
  tmbId: TeamMemberIdSchema,
  status: TeamMemberStatusSchema
});
export type UpdateTeamMemberInviteBodyType = z.infer<typeof UpdateTeamMemberInviteBodySchema>;
/* ============================================================================
 * API: 更新当前用户成员名称
 * Route: PUT /api/proApi/support/user/team/member/updateName
 * Method: PUT
 * Description: 当前用户更新自己在当前团队中的成员名称。
 * Tags: ['成员管理', '团队管理', 'Write']
 * ============================================================================ */

export const UpdateTeamMemberNameBodySchema = z.object({
  name: TeamMemberNameSchema.meta({
    example: '张三',
    description: '新的成员名称，trim 后不能为空，最多 20 个字符且不能使用系统保留值'
  })
});
export type UpdateTeamMemberNameBodyType = z.infer<typeof UpdateTeamMemberNameBodySchema>;

/* ============================================================================
 * API: 管理员更新团队成员名称
 * Route: PUT /api/proApi/support/user/team/member/updateNameByManager
 * Method: PUT
 * Description: 团队管理员更新指定团队成员的名称。
 * Tags: ['成员管理', '团队管理', 'Write']
 * ============================================================================ */

export const UpdateTeamMemberNameByManagerBodySchema = z.object({
  tmbId: TeamMemberIdSchema.meta({ description: '需要修改名称的团队成员 ID' }),
  name: TeamMemberNameSchema.meta({
    example: '李四',
    description: '新的成员名称，trim 后不能为空，最多 20 个字符且不能使用系统保留值'
  })
});
export type UpdateTeamMemberNameByManagerBodyType = z.infer<
  typeof UpdateTeamMemberNameByManagerBodySchema
>;
