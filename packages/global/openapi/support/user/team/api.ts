import z from 'zod';
import { LafAccountSchema, OpenaiAccountSchema } from '../../../../support/user/team/type';

export const TeamChangeOwnerBodySchema = z.object({
  userId: z.string().describe("the New Owner's UserId.")
});

export const TeamChangeOwnerResponseSchema = z.object();

export type TeamChangeOwnerBodyType = z.infer<typeof TeamChangeOwnerBodySchema>;
export type TeamChangeOwnerResponseType = z.infer<typeof TeamChangeOwnerResponseSchema>;

/* ============================================================================
 * API: 更新团队信息
 * Route: POST /api/support/user/team/update
 * ============================================================================ */
export const UpdateTeamBodySchema = z.object({
  name: z.string().max(100).optional().meta({
    example: '我的团队',
    description: '团队名称'
  }),
  avatar: z.string().optional().meta({
    description: '团队头像 URL'
  }),
  teamDomain: z.string().optional().meta({
    description: '团队域名'
  }),
  lafAccount: LafAccountSchema.optional().meta({
    description: 'Laf 账号配置'
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

export const UpdateTeamResponseSchema = z.object({});
export type UpdateTeamResponseType = z.infer<typeof UpdateTeamResponseSchema>;
