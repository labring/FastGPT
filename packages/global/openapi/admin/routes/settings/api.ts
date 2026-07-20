import z from 'zod';

export const GetConfigResponseSchema = z.object({
  fastgpt: z.any().optional().meta({ description: '系统 FastGPT 配置' }),
  fastgptPro: z
    .any()
    .optional()
    .meta({ description: '系统 FastGPT Pro 商业版配置（不含 license）' })
});

export const UpdateConfigBodySchema = z.object({
  fastgpt: z.any().optional().meta({ description: 'FastGPT 系统配置对象' }),
  fastgptPro: z.any().optional().meta({ description: 'FastGPT Pro 商业版配置对象' })
});
