import z from 'zod';
import { BoolSchema } from '../../../../common/zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { TeamMemberStatusEnum } from '../../../../support/user/team/constant';
import { OpenaiAccountSchema } from '../../../../support/user/team/type';
import { ClientTeamPlanStatusSchema } from '../../../../support/wallet/sub/type';

/* ============================================================================
 * API: 聚合搜索团队成员、组织和用户组
 * Route: GET /api/proApi/support/user/team/searchMembersOrgsGroups
 * Method: GET
 * Description: 在当前团队中按关键词搜索成员、组织和用户组。
 * Tags: ['团队管理', 'Read']
 * ============================================================================ */

export const SearchMembersOrgsGroupsQuerySchema = z
  .object({
    searchKey: z.string().trim().max(128).optional().default('').meta({
      example: '张三',
      description: '搜索关键词；为空时返回空结果'
    }),
    members: BoolSchema.optional().meta({
      example: true,
      description: '是否搜索团队成员，默认 true'
    }),
    orgs: BoolSchema.optional().meta({
      example: true,
      description: '是否搜索组织，默认 true'
    }),
    groups: BoolSchema.optional().meta({
      example: true,
      description: '是否搜索用户组，默认 true'
    })
  })
  .meta({
    example: {
      searchKey: '张三',
      members: true,
      orgs: true,
      groups: true
    }
  });
export type SearchMembersOrgsGroupsQueryType = z.infer<typeof SearchMembersOrgsGroupsQuerySchema>;

const SearchMemberSchema = z
  .object({
    tmbId: ObjectIdSchema.meta({
      example: '68ad85a7463006c963799a05',
      description: '团队成员 ID'
    }),
    userId: ObjectIdSchema.meta({
      example: '68ad85a7463006c963799a06',
      description: '用户 ID'
    }),
    teamId: ObjectIdSchema.meta({
      example: '68ad85a7463006c963799a07',
      description: '团队 ID'
    }),
    name: z.string().meta({
      example: '张三',
      description: '成员名称'
    }),
    memberName: z.string().meta({
      example: '张三',
      description: '成员展示名称'
    }),
    avatar: z.string().meta({
      example: 'https://example.com/avatar.png',
      description: '成员头像'
    }),
    status: z.enum(TeamMemberStatusEnum).meta({
      example: TeamMemberStatusEnum.active,
      description: '成员状态'
    }),
    role: z.string().optional().meta({
      example: 'owner',
      description: '成员角色'
    }),
    contact: z.string().optional().meta({
      example: 'user@example.com',
      description: '成员联系方式'
    }),
    createTime: z.coerce.date().meta({
      example: '2026-01-01T00:00:00.000Z',
      description: '成员创建时间'
    }),
    updateTime: z.coerce.date().optional().meta({
      example: '2026-01-02T00:00:00.000Z',
      description: '成员更新时间'
    })
  })
  .meta({
    description: '匹配到的团队成员'
  });

const SearchOrgSchema = z
  .object({
    _id: ObjectIdSchema.meta({
      example: '68ad85a7463006c963799a08',
      description: '组织 ID'
    }),
    teamId: ObjectIdSchema.meta({
      example: '68ad85a7463006c963799a07',
      description: '团队 ID'
    }),
    pathId: z.string().meta({
      example: 'org-root',
      description: '组织路径 ID'
    }),
    path: z.string().meta({
      example: '/研发部',
      description: '组织路径'
    }),
    name: z.string().meta({
      example: '研发部',
      description: '组织名称'
    }),
    avatar: z.string().meta({
      example: 'https://example.com/org-avatar.png',
      description: '组织头像'
    }),
    description: z.string().optional().meta({
      example: '负责产品研发',
      description: '组织描述'
    }),
    updateTime: z.coerce.date().meta({
      example: '2026-01-02T00:00:00.000Z',
      description: '组织更新时间'
    }),
    total: z.number().meta({
      example: 12,
      description: '组织成员和子组织总数'
    })
  })
  .meta({
    description: '匹配到的组织'
  });

const SearchGroupSchema = z
  .object({
    _id: ObjectIdSchema.meta({
      example: '68ad85a7463006c963799a09',
      description: '用户组 ID'
    }),
    teamId: ObjectIdSchema.meta({
      example: '68ad85a7463006c963799a07',
      description: '团队 ID'
    }),
    name: z.string().meta({
      example: '管理员组',
      description: '用户组名称'
    }),
    avatar: z.string().optional().meta({
      example: 'https://example.com/group-avatar.png',
      description: '用户组头像'
    }),
    updateTime: z.coerce.date().meta({
      example: '2026-01-02T00:00:00.000Z',
      description: '用户组更新时间'
    })
  })
  .meta({
    description: '匹配到的用户组'
  });

export const SearchMembersOrgsGroupsResponseSchema = z
  .object({
    members: z.array(SearchMemberSchema).meta({
      description: '匹配到的团队成员列表'
    }),
    orgs: z.array(SearchOrgSchema).meta({
      description: '匹配到的组织列表'
    }),
    groups: z.array(SearchGroupSchema).meta({
      description: '匹配到的用户组列表'
    })
  })
  .meta({
    example: {
      members: [],
      orgs: [],
      groups: []
    }
  });
export type SearchMembersOrgsGroupsResponseType = z.infer<
  typeof SearchMembersOrgsGroupsResponseSchema
>;

/* ============================================================================
 * API: 同步用户和组织
 * Route: POST /api/proApi/support/user/team/sync
 * Method: POST
 * Description: 从外部用户系统同步当前团队的用户和组织数据。
 * Tags: ['团队管理', 'Write']
 * ============================================================================ */

export const UserSyncBodySchema = z.object({}).default({}).meta({
  description: '无需请求参数'
});
export type UserSyncBodyType = z.infer<typeof UserSyncBodySchema>;

export const UserSyncResponseSchema = z.undefined().meta({
  description: '用户和组织同步成功'
});
export type UserSyncResponseType = z.infer<typeof UserSyncResponseSchema>;

export const TeamChangeOwnerBodySchema = z.object({
  userId: z.string().describe("the New Owner's UserId.")
});

export const TeamChangeOwnerResponseSchema = z.undefined().meta({ description: '操作成功' });

export type TeamChangeOwnerBodyType = z.infer<typeof TeamChangeOwnerBodySchema>;
export type TeamChangeOwnerResponseType = z.infer<typeof TeamChangeOwnerResponseSchema>;

/* ============================================================================
 * API: 更新团队信息
 * Route: PUT /api/support/user/team/update
 * Method: PUT
 * ============================================================================ */
export const UpdateTeamBodySchema = z.object({
  name: z.string().max(100).optional().meta({
    example: '我的团队',
    description: '团队名称'
  }),
  avatar: z.string().optional().meta({
    description: '团队头像 URL'
  }),
  openaiAccount: OpenaiAccountSchema.optional().meta({
    description: 'OpenAI 账号配置'
  }),
  externalWorkflowVariable: z
    .object({
      key: z
        .string()
        .regex(/^[a-zA-Z_]\w*$/, 'key 仅允许字母、数字、下划线，且不能以数字开头')
        .meta({
          example: 'myVar',
          description: '变量名，仅允许字母、数字、下划线，且不以数字开头'
        }),
      value: z.string().meta({
        example: 'myValue',
        description: '变量值，为空字符串时删除该变量'
      })
    })
    .optional()
    .meta({
      description: '外部工作流变量（单次更新一个变量）'
    })
});
export type UpdateTeamBodyType = z.infer<typeof UpdateTeamBodySchema>;

export const UpdateTeamResponseSchema = z.undefined().meta({ description: '更新成功' });
export type UpdateTeamResponseType = z.infer<typeof UpdateTeamResponseSchema>;

/* ============================================================================
 * API: 获取团队套餐状态
 * Route: GET /api/support/user/team/plan/getTeamPlanStatus
 * Method: GET
 * Description: 获取当前团队的套餐额度及成员、应用、知识库等资源用量
 * Tags: ['辅助-用户体系', '团队管理', 'Read']
 * ============================================================================ */

export const GetTeamPlanStatusQuerySchema = z.object({}).meta({
  description: '该接口不需要查询参数'
});
export type GetTeamPlanStatusQuery = z.infer<typeof GetTeamPlanStatusQuerySchema>;

export const GetTeamPlanStatusResponseSchema = ClientTeamPlanStatusSchema.optional().meta({
  description: '鉴权或套餐状态查询失败时不返回业务数据'
});
export type GetTeamPlanStatusResponse = z.infer<typeof GetTeamPlanStatusResponseSchema>;
