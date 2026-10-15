import z from 'zod';

/** 结构化工作流引用，支持单个引用和兼容历史的引用数组。 */
export const ReferenceValueSchema = z.union([
  z.tuple([z.string().min(1), z.string().min(1)]),
  z.array(z.tuple([z.string().min(1), z.string().min(1)])).min(1)
]);
export type ReferenceValue = z.infer<typeof ReferenceValueSchema>;

const SecretPlainValueSchema = z
  .object({
    value: z.string().meta({
      description: '密钥明文值；服务端保存时会加密为 secret'
    })
  })
  .strict();

const SecretCipherValueSchema = z
  .object({
    secret: z.string().meta({
      description: '已加密或脱敏后的密钥值'
    })
  })
  .strict();

export const StaticSecretValueSchema = z.union([SecretPlainValueSchema, SecretCipherValueSchema]);

export const SecretRefValueSchema = z
  .object({
    ref: ReferenceValueSchema.meta({
      description: '工作流变量引用，运行时解析后使用'
    })
  })
  .strict();

export const SecretValueTypeSchema = z.union([StaticSecretValueSchema, SecretRefValueSchema]).meta({
  description: '密钥值类型，使用 value 明文、secret 密文或 ref 工作流变量引用。',
  example: {
    secret: 'encrypted-value'
  }
});
export type SecretValueType = z.infer<typeof SecretValueTypeSchema>;

export const StoreSecretValueTypeSchema = z.record(z.string(), SecretValueTypeSchema).meta({
  description: '存储密钥值类型，key 为密钥名称，value 为密钥值。',
  example: {
    Authorization: {
      secret: 'encrypted-value'
    }
  }
});
export type StoreSecretValueType = z.infer<typeof StoreSecretValueTypeSchema>;
