import z from 'zod';

export const SecretValueTypeSchema = z
  .object({
    value: z.string(),
    secret: z.string()
  })
  .meta({
    description: '密钥值类型，value 为明文，srcret 为密文，如果了 value 则优先使用 value。',
    example: {
      value: '1234567890',
      secret: ''
    }
  });
export type SecretValueType = z.infer<typeof SecretValueTypeSchema>;

export const StoreSecretValueTypeSchema = z.record(z.string(), SecretValueTypeSchema).meta({
  description: '存储密钥值类型，key 为密钥名称，value 为密钥值。',
  example: {
    Authorization: {
      value: '1234567890',
      secret: ''
    }
  }
});
export type StoreSecretValueType = z.infer<typeof StoreSecretValueTypeSchema>;
