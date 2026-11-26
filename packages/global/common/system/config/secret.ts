import z from 'zod';

/** 管理接口只传递已配置状态，不向客户端返回密钥明文或持久化密文。 */
export const ConfiguredSecretSchema = z.strictObject({
  isSecret: z.literal(true).meta({ description: '已保存密钥；回提交表示保留原值', example: true })
});
export type ConfiguredSecret = z.infer<typeof ConfiguredSecretSchema>;

/** 只承认精确标记；false、额外字段和持久化 secret wrapper 均不能用于保留密钥。 */
export const isConfiguredSecret = (value: unknown): value is ConfiguredSecret =>
  ConfiguredSecretSchema.safeParse(value).success;
