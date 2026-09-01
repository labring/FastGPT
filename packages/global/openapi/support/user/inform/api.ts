import { z } from 'zod';
import { LanguageSchema } from '../../../../common/i18n/type';
import { InformLevelEnum } from '../../../../support/user/inform/constants';
import { VerificationCodeTypeEnum } from '../../../../support/user/account/verification/constants';
import {
  AccountContactUsernameSchema,
  ShortAuthStringSchema,
  VERIFICATION_CODE_PURPOSES_BY_TYPE
} from '../../../../support/user/account/verification/type';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { PaginationSchema } from '../../../api';

const SendAuthCodeCommonSchema = z.object({
  username: AccountContactUsernameSchema.meta({
    description: '接收验证码的邮箱或手机号',
    example: 'user@example.com'
  }),
  captcha: ShortAuthStringSchema.max(64).meta({
    description: '图片验证码答案',
    example: 'A1B2C3'
  }),
  lang: LanguageSchema.meta({
    description: '验证码消息语言',
    example: 'zh-CN'
  })
});

export const SendAuthCodeBodySchema = z.discriminatedUnion('type', [
  SendAuthCodeCommonSchema.extend({
    type: z.literal(VerificationCodeTypeEnum.register).meta({
      description: '验证码类型',
      example: VerificationCodeTypeEnum.register
    }),
    purpose: z.literal(VERIFICATION_CODE_PURPOSES_BY_TYPE[VerificationCodeTypeEnum.register]).meta({
      description: '验证码业务场景',
      example: 'register'
    })
  }),
  SendAuthCodeCommonSchema.extend({
    type: z.literal(VerificationCodeTypeEnum.findPassword).meta({
      description: '验证码类型',
      example: VerificationCodeTypeEnum.findPassword
    }),
    purpose: z
      .literal(VERIFICATION_CODE_PURPOSES_BY_TYPE[VerificationCodeTypeEnum.findPassword])
      .meta({
        description: '验证码业务场景',
        example: 'forgetPassword'
      })
  }),
  SendAuthCodeCommonSchema.extend({
    type: z.literal(VerificationCodeTypeEnum.bindNotification).meta({
      description: '验证码类型',
      example: VerificationCodeTypeEnum.bindNotification
    }),
    purpose: z
      .literal(VERIFICATION_CODE_PURPOSES_BY_TYPE[VerificationCodeTypeEnum.bindNotification])
      .meta({
        description: '验证码业务场景',
        example: 'bindNotification'
      })
  })
]);
export type SendAuthCodeBodyType = z.infer<typeof SendAuthCodeBodySchema>;

export const SendAuthCodeResponseSchema = z.object({
  message: z.string().meta({ description: '发送结果说明', example: '发送验证码成功' })
});
export type SendAuthCodeResponseType = z.infer<typeof SendAuthCodeResponseSchema>;

/* ============================================================================
 * API: 获取用户通知列表
 * Route: POST /api/proApi/support/user/inform/list
 * Method: POST
 * Description: 分页获取当前用户的站内通知列表，未读通知优先展示。
 * Tags: ['用户通知', 'Read']
 * ============================================================================ */

export const GetUserInformListBodySchema = PaginationSchema.meta({
  description: '用户通知列表分页参数'
});
export type GetUserInformListBodyType = z.infer<typeof GetUserInformListBodySchema>;

export const UserInformItemSchema = z
  .object({
    _id: ObjectIdSchema.meta({
      example: '68ad85a7463006c963799a11',
      description: '通知 ID'
    }),
    userId: ObjectIdSchema.meta({
      example: '68ad85a7463006c963799a05',
      description: '接收通知的用户 ID'
    }),
    teamId: ObjectIdSchema.optional().meta({
      example: '68ad85a7463006c963799a07',
      description: '关联团队 ID'
    }),
    teamName: z.string().optional().meta({
      example: 'FastGPT',
      description: '关联团队名称'
    }),
    time: z.coerce.date().meta({
      example: '2026-01-02T00:00:00.000Z',
      description: '通知时间'
    }),
    level: z.enum(InformLevelEnum).meta({
      example: InformLevelEnum.important,
      description: '通知等级'
    }),
    title: z.string().meta({
      example: '团队成员变更',
      description: '通知标题'
    }),
    content: z.string().meta({
      example: '你的团队成员发生了变更',
      description: '通知内容'
    }),
    read: z.boolean().meta({
      example: false,
      description: '是否已读'
    })
  })
  .meta({
    description: '用户通知项'
  });

export const GetUserInformListResponseSchema = z.object({
  list: z.array(UserInformItemSchema).meta({
    description: '通知列表'
  }),
  total: z.number().meta({
    example: 20,
    description: '通知总数'
  })
});
export type GetUserInformListResponseType = z.infer<typeof GetUserInformListResponseSchema>;

/* ============================================================================
 * API: 获取未读通知数量
 * Route: GET /api/proApi/support/user/inform/countUnread
 * Method: GET
 * Description: 获取当前用户的未读通知数量和重要未读通知。
 * Tags: ['用户通知', 'Read']
 * ============================================================================ */

const UnreadInformSummarySchema = z
  .object({
    unReadCount: z.number().int().nonnegative().meta({
      example: 3,
      description: '未读通知数量'
    }),
    importantInforms: z.array(UserInformItemSchema).meta({
      description: '重要和紧急未读通知，最多返回 2 条'
    })
  })
  .meta({
    description: '未读通知摘要'
  });

export const GetUnreadInformResponseSchema = z
  .union([
    z.literal(0).meta({
      example: 0,
      description: '未登录或查询失败时的兼容返回值'
    }),
    UnreadInformSummarySchema
  ])
  .meta({
    example: {
      unReadCount: 3,
      importantInforms: []
    },
    description: '未读通知数量和重要通知'
  });
export type GetUnreadInformResponseType = z.infer<typeof GetUnreadInformResponseSchema>;

/* ============================================================================
 * API: 标记通知已读
 * Route: GET /api/proApi/support/user/inform/read
 * Method: GET
 * Description: 将当前用户指定的通知标记为已读。
 * Tags: ['用户通知', 'Write']
 * ============================================================================ */

export const ReadInformQuerySchema = z.object({
  id: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a11',
    description: '通知 ID'
  })
});
export type ReadInformQueryType = z.infer<typeof ReadInformQuerySchema>;
