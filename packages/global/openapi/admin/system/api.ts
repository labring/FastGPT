import z from 'zod';
import { SubPlanSchema } from '../../../support/wallet/sub/type';
import { FastGPTFeConfigsSchema, SystemEnvSchema } from '../../../common/system/types';

/* ============================================================================
 * API: 获取系统配置
 * Route: GET /api/proApi/admin/system/getConfig
 * Method: GET
 * Description: 获取 FastGPT 和 FastGPT Pro 的当前系统配置
 * Tags: ['Admin', 'Settings', 'Read']
 * ============================================================================ */

export const FastGPTConfigSchema = z
  .looseObject({
    feConfigs: FastGPTFeConfigsSchema.optional().meta({ description: '前端功能和展示配置' }),
    systemEnv: SystemEnvSchema.optional().meta({ description: '服务端系统运行配置' }),
    subPlans: SubPlanSchema.optional().meta({ description: '订阅套餐配置' })
  })
  .meta({ example: { feConfigs: {}, systemEnv: {} }, description: '系统 FastGPT 配置' });

export const FastGPTProConfigSchema = z
  .looseObject({})
  .meta({ example: {}, description: '系统 FastGPT Pro 商业版配置（不含 license）' });

export const GetConfigResponseSchema = z.object({
  fastgpt: FastGPTConfigSchema.optional(),
  fastgptPro: FastGPTProConfigSchema.optional(),
  subPlansRevision: z.number().int().nonnegative().optional().meta({
    description: '套餐对应的 commercial 配置域 revision，用于保存套餐时的乐观锁校验'
  })
});
export type GetConfigResponse = z.infer<typeof GetConfigResponseSchema>;
