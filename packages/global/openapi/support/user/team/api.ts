import z from 'zod';
import { OpenaiAccountSchema } from '../../../../support/user/team/type';
import { ClientTeamPlanStatusSchema } from '../../../../support/wallet/sub/type';

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
