import z from 'zod';

/* ============================================================================
 * API: 查询第三方工作流用量
 * Route: GET /api/support/user/team/thirtdParty/checkUsage
 * Method: GET
 * Description: 查询当前团队成员配置的第三方工作流变量对应的用量
 * Tags: ['通用-基础功能', '其他', 'Read']
 * ============================================================================ */

export const CheckThirdPartyUsageQuerySchema = z.object({
  key: z.string().min(1).meta({
    example: 'externalWorkflowKey',
    description: '外部工作流变量配置键'
  })
});
export type CheckThirdPartyUsageQuery = z.infer<typeof CheckThirdPartyUsageQuerySchema>;

export const CheckThirdPartyUsageResponseSchema = z
  .object({
    total: z.number().nonnegative().meta({
      example: 1000,
      description: '第三方服务提供的总额度'
    }),
    used: z.number().nonnegative().meta({
      example: 120,
      description: '第三方服务提供的已使用额度'
    })
  })
  .optional()
  .meta({ description: '未配置对应服务或查询失败时不返回业务数据' });
export type CheckThirdPartyUsageResponse = z.infer<typeof CheckThirdPartyUsageResponseSchema>;
