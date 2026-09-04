import z from 'zod';
import { ObjectIdSchema } from '../../../../../common/type/mongo';
import { TeamMemberNameSchema } from '../../../../../support/user/team/memberName';

const InvitationLinkIdSchema = z.string().min(1).meta({
  example: 'V1StGXR8_Z5jdHi6B-myT',
  description: '邀请链接 ID'
});

const InvitationLinkExpiresSchema = z.enum(['30m', '7d', '1y']).meta({
  example: '7d',
  description: '邀请链接有效期：30 分钟、7 天或 1 年'
});

const InvitationLinkMemberSchema = z
  .object({
    tmbId: ObjectIdSchema.meta({
      example: '68ad85a7463006c963799a06',
      description: '已通过该邀请链接加入的团队成员 ID'
    }),
    avatar: z.string().nullish().meta({ description: '团队成员头像' }),
    name: z.string().meta({ description: '团队成员名称' })
  })
  .meta({ description: '通过邀请链接加入的团队成员' });

const InvitationLinkBaseShape = {
  _id: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '邀请链接记录 ID'
  }),
  linkId: InvitationLinkIdSchema,
  teamId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a06',
    description: '所属团队 ID'
  }),
  usedTimesLimit: z
    .union([z.literal(1), z.literal(-1)])
    .optional()
    .meta({
      example: 1,
      description: '使用次数限制，1 表示仅限一人，-1 表示不限次数'
    }),
  forbidden: z.boolean().optional().meta({ description: '是否已禁用邀请链接' }),
  expires: z.coerce.date().meta({
    example: '2026-08-26T00:00:00.000Z',
    description: '邀请链接过期时间'
  }),
  description: z.string().meta({ description: '邀请链接描述' }),
  creatorUsername: z.string().optional().meta({ description: '邀请链接创建者用户名' })
};

/* ============================================================================
 * API: 接受团队邀请链接并设置成员名
 * Route: POST /api/proApi/support/user/team/invitationLink/acceptWithMemberName
 * Method: POST
 * Description: 当前用户设置目标团队成员名并接受邀请链接。
 * Tags: ['邀请链接管理', '团队管理', 'Write']
 * ============================================================================ */

export const AcceptInvitationWithMemberNameBodySchema = z
  .object({
    linkId: InvitationLinkIdSchema,
    memberName: TeamMemberNameSchema.meta({ description: '目标团队成员名', example: '张三' })
  })
  .meta({ example: { linkId: 'V1StGXR8_Z5jdHi6B-myT', memberName: '张三' } });
export type AcceptInvitationWithMemberNameBodyType = z.infer<
  typeof AcceptInvitationWithMemberNameBodySchema
>;

export const AcceptInvitationWithMemberNameResponseSchema = z.object({
  teamId: ObjectIdSchema.meta({ description: '目标团队 ID' }),
  tmbId: ObjectIdSchema.meta({ description: '目标团队成员 ID' })
});
export type AcceptInvitationWithMemberNameResponseType = z.infer<
  typeof AcceptInvitationWithMemberNameResponseSchema
>;

/* ============================================================================
 * API: 创建团队邀请链接
 * Route: POST /api/proApi/support/user/team/invitationLink/create
 * Method: POST
 * Description: 为当前团队创建邀请链接，可设置有效期和使用次数限制。
 * Tags: ['邀请链接管理', '团队管理', 'Write']
 * ============================================================================ */

export const CreateInvitationLinkBodySchema = z
  .object({
    description: z.string().min(1).meta({
      example: '邀请新成员加入 FastGPT 团队',
      description: '邀请链接描述'
    }),
    expires: InvitationLinkExpiresSchema,
    usedTimesLimit: z.union([z.literal(1), z.literal(-1)]).meta({
      example: 1,
      description: '使用次数限制，1 表示仅限一人，-1 表示不限次数'
    })
  })
  .meta({
    example: {
      description: '邀请新成员加入 FastGPT 团队',
      expires: '7d',
      usedTimesLimit: 1
    }
  });
export type CreateInvitationLinkBodyType = z.infer<typeof CreateInvitationLinkBodySchema>;

export const CreateInvitationLinkResponseSchema = z.string().meta({
  description: '新创建的邀请链接 ID'
});
export type CreateInvitationLinkResponseType = z.infer<typeof CreateInvitationLinkResponseSchema>;

/* ============================================================================
 * API: 禁用团队邀请链接
 * Route: PUT /api/proApi/support/user/team/invitationLink/forbid
 * Method: PUT
 * Description: 禁用当前团队指定的邀请链接，使其立即失效。
 * Tags: ['邀请链接管理', '团队管理', 'Write']
 * ============================================================================ */

export const ForbidInvitationLinkBodySchema = z
  .object({
    linkId: InvitationLinkIdSchema
  })
  .meta({ example: { linkId: 'V1StGXR8_Z5jdHi6B-myT' } });
export type ForbidInvitationLinkBodyType = z.infer<typeof ForbidInvitationLinkBodySchema>;

/* ============================================================================
 * API: 获取团队邀请链接信息
 * Route: GET /api/proApi/support/user/team/invitationLink/info
 * Method: GET
 * Description: 获取有效邀请链接的状态、所属团队和当前用户加入状态。
 * Tags: ['邀请链接管理', '团队管理', 'Read']
 * ============================================================================ */

export const GetInvitationLinkInfoQuerySchema = z.object({
  linkId: InvitationLinkIdSchema
});
export type GetInvitationLinkInfoQueryType = z.infer<typeof GetInvitationLinkInfoQuerySchema>;

export const GetInvitationLinkInfoResponseSchema = z
  .object({
    ...InvitationLinkBaseShape,
    members: z.array(ObjectIdSchema).meta({ description: '已通过邀请链接加入的成员 ID 列表' }),
    teamAvatar: z.string().nullish().meta({ description: '团队头像' }),
    teamName: z.string().meta({ description: '团队名称' }),
    alreadyJoined: z.boolean().meta({ description: '当前用户是否已经加入该团队' })
  })
  .meta({ description: '有效邀请链接详情' });
export type GetInvitationLinkInfoResponseType = z.infer<typeof GetInvitationLinkInfoResponseSchema>;

/* ============================================================================
 * API: 获取团队邀请链接列表
 * Route: GET /api/proApi/support/user/team/invitationLink/list
 * Method: GET
 * Description: 获取当前团队创建的全部邀请链接及其已加入成员信息。
 * Tags: ['邀请链接管理', '团队管理', 'Read']
 * ============================================================================ */

export const InvitationLinkListItemSchema = z
  .object({
    ...InvitationLinkBaseShape,
    members: z.array(InvitationLinkMemberSchema).meta({
      description: '已通过邀请链接加入的团队成员列表'
    })
  })
  .meta({ description: '团队邀请链接' });

export const GetInvitationLinkListResponseSchema = z
  .array(InvitationLinkListItemSchema)
  .meta({ description: '团队邀请链接列表' });
export type GetInvitationLinkListResponseType = z.infer<typeof GetInvitationLinkListResponseSchema>;
