import z from 'zod';
import { SubPlanInputSchema } from '../../../../support/wallet/sub/type';

/* ============================================================================
 * API: 获取系统配置
 * Route: GET /api/admin/routes/settings/getConfig
 * Method: GET
 * Description: 获取 FastGPT 和 FastGPT Pro 的当前系统配置
 * Tags: ['Admin', 'Settings', 'Read']
 * ============================================================================ */

export const GetConfigResponseSchema = z.object({
  fastgpt: z.any().optional().meta({ description: '系统 FastGPT 配置' }),
  fastgptPro: z
    .any()
    .optional()
    .meta({ description: '系统 FastGPT Pro 商业版配置（不含 license）' })
});

/* ============================================================================
 * API: 更新系统配置
 * Route: POST /api/admin/routes/settings/updateConfig
 * Method: POST
 * Description: 校验、归一化并更新 FastGPT 和 FastGPT Pro 的系统配置
 * Tags: ['Admin', 'Settings', 'Write']
 * ============================================================================ */

export const UpdateConfigBodySchema = z.object({
  fastgpt: z
    .looseObject({
      feConfigs: z.looseObject({}).meta({
        example: {},
        description: '前端功能和展示配置'
      }),
      systemEnv: z.looseObject({}).meta({
        example: {},
        description: '服务端系统运行配置'
      }),
      subPlans: SubPlanInputSchema.optional().meta({
        example: {},
        description: '订阅套餐配置'
      })
    })
    .meta({ example: { feConfigs: {}, systemEnv: {} }, description: 'FastGPT 系统配置对象' }),
  fastgptPro: z.looseObject({}).meta({ example: {}, description: 'FastGPT Pro 商业版配置对象' })
});
export type UpdateConfigBody = z.infer<typeof UpdateConfigBodySchema>;

export const UpdateConfigResponseSchema = z.undefined().meta({ description: '更新成功' });
export type UpdateConfigResponse = z.infer<typeof UpdateConfigResponseSchema>;
