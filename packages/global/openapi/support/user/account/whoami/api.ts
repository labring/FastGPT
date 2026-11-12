import { z } from 'zod';
import { ObjectIdSchema } from '../../../../../common/type/mongo';
import { ApiKeyTypeEnum } from '../../../../../support/openapi/constants';
import { ApiKeyTypeSchema } from '../../../../../support/openapi/schema';
import { AuthUserTypeEnum } from '../../../../../support/permission/constant';
import { TeamPermissionSummarySchema } from '../../../../../support/permission/user/controller';
import { TeamMemberRoleEnum } from '../../../../../support/user/team/constant';

/* ============================================================================
 * API: 获取当前鉴权凭据主体信息
 * Route: GET /api/support/user/account/whoami
 * Method: GET
 * Description: 同时支持 Session Token、个人 API Key 与应用 API Key，返回调用主体身份、所属团队及限额信息
 * Tags: ['用户账号', 'API Key 管理']
 * ============================================================================ */

export const WhoamiUserSchema = z.object({
  userId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '用户 ID'
  }),
  username: z.string().meta({
    example: 'developer@fastgpt.in',
    description: '用户名'
  })
});
export type WhoamiUserType = z.infer<typeof WhoamiUserSchema>;

export const WhoamiTokenUserSchema = WhoamiUserSchema.extend({
  avatar: z.string().nullish().meta({
    example: '/icon/avatar.svg',
    description: '用户当前成员头像'
  })
});
export type WhoamiTokenUserType = z.infer<typeof WhoamiTokenUserSchema>;

export const WhoamiTeamSchema = z.object({
  teamId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a06',
    description: '当前所属团队 ID'
  }),
  teamName: z.string().meta({
    example: 'FastGPT 团队',
    description: '当前所属团队名称'
  }),
  tmbId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a07',
    description: '团队成员 ID'
  }),
  role: z.enum(TeamMemberRoleEnum).nullable().meta({
    example: TeamMemberRoleEnum.owner,
    description: '团队成员角色（历史兼容字段，owner 表示所有者，其他为 null）'
  })
});
export type WhoamiTeamType = z.infer<typeof WhoamiTeamSchema>;

export const WhoamiSessionSchema = z.object({
  createdAt: z.number().int().nonnegative().meta({
    example: 1762752000000,
    description: '会话创建时间戳（毫秒）'
  }),
  expiresAt: z.number().int().nonnegative().meta({
    example: 1763356800000,
    description: '会话过期时间戳（毫秒，基于 7 天 TTL 计算）'
  })
});
export type WhoamiSessionType = z.infer<typeof WhoamiSessionSchema>;

export const WhoamiApiKeyLimitSchema = z.object({
  expiredTime: z.string().nullable().meta({
    example: '2026-12-31T23:59:59.000Z',
    description: '到期时间（ISO-8601 字符串），null 表示永不过期'
  }),
  maxUsagePoints: z.number().meta({
    example: 10000,
    description: '积分上限，-1 表示无限制'
  }),
  usagePoints: z.number().meta({
    example: 120,
    description: '已累计消耗积分'
  }),
  remainingPoints: z.number().nullable().meta({
    example: 9880,
    description: '剩余可用积分；无积分上限时为 null'
  })
});
export type WhoamiApiKeyLimitType = z.infer<typeof WhoamiApiKeyLimitSchema>;

export const WhoamiApiKeySchema = z.object({
  id: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a08',
    description: 'API Key 记录 ID'
  }),
  name: z.string().meta({
    example: 'CI-Pipeline',
    description: 'API Key 名称'
  }),
  maskedKey: z.string().meta({
    example: '******9a0f',
    description: '脱敏后的 API Key'
  }),
  boundAppId: ObjectIdSchema.optional().meta({
    example: '68ad85a7463006c963799a09',
    description: '应用 API Key 绑定的应用 ID；个人 API Key 不返回'
  }),
  boundAppName: z.string().optional().meta({
    example: '客服助手',
    description: '应用 API Key 绑定的应用名称；个人 API Key 不返回'
  }),
  authProxy: z.boolean().meta({
    example: false,
    description: '是否允许在对话及对话管理请求中代理团队成员身份（仅个人 API Key 生效）'
  }),
  limit: WhoamiApiKeyLimitSchema.meta({
    description: 'API Key 有效期与积分限额状态'
  })
});
export type WhoamiApiKeyType = z.infer<typeof WhoamiApiKeySchema>;

export const WhoamiTokenResponseSchema = z.object({
  authType: z.literal(AuthUserTypeEnum.token).meta({
    example: AuthUserTypeEnum.token,
    description: '鉴权凭据类型：用户会话 Token'
  }),
  user: WhoamiTokenUserSchema.meta({
    description: '当前登录用户信息'
  }),
  team: WhoamiTeamSchema.extend({
    permission: TeamPermissionSummarySchema.meta({
      description: '当前成员在团队中的权限摘要'
    })
  }).meta({
    description: '当前会话关联的团队及权限摘要'
  }),
  isRoot: z.boolean().meta({
    example: false,
    description: '当前会话是否具备系统 Root 身份'
  }),
  session: WhoamiSessionSchema.meta({
    description: '当前会话生命周期信息'
  })
});
export type WhoamiTokenResponseType = z.infer<typeof WhoamiTokenResponseSchema>;

export const WhoamiApiKeyResponseSchema = z.object({
  authType: z.literal(AuthUserTypeEnum.apikey).meta({
    example: AuthUserTypeEnum.apikey,
    description: '鉴权凭据类型：API Key'
  }),
  apiKeyType: ApiKeyTypeSchema.meta({
    example: ApiKeyTypeEnum.personal,
    description: 'API Key 类型：personal（个人密钥）或 app（应用绑定密钥）'
  }),
  user: WhoamiUserSchema.meta({
    description: 'API Key 归属用户基本信息'
  }),
  team: WhoamiTeamSchema.extend({
    permission: TeamPermissionSummarySchema.nullable().meta({
      description: '个人 API Key 对应创建者的团队权限摘要；应用 API Key 不授予成员权限，固定为 null'
    })
  }).meta({
    description: 'API Key 所属团队信息'
  }),
  apiKey: WhoamiApiKeySchema.meta({
    description: 'API Key 元数据及配额信息'
  })
});
export type WhoamiApiKeyResponseType = z.infer<typeof WhoamiApiKeyResponseSchema>;

export const WhoamiResponseSchema = z.discriminatedUnion('authType', [
  WhoamiTokenResponseSchema,
  WhoamiApiKeyResponseSchema
]);
export type WhoamiResponseType = z.infer<typeof WhoamiResponseSchema>;
