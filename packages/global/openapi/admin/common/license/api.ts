import z from 'zod';

export const ActiveLicenseBodySchema = z.object({
  license: z.string().meta({ description: '许可证密钥字符串' })
});
