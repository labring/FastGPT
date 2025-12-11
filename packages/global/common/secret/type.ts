import z from 'zod';

export const SecretValueTypeSchema = z.object({
  value: z.string(),
  secret: z.string()
});
export type SecretValueType = z.infer<typeof SecretValueTypeSchema>;

export const StoreSecretValueTypeSchema = z.record(z.string(), SecretValueTypeSchema);
export type StoreSecretValueType = z.infer<typeof StoreSecretValueTypeSchema>;
