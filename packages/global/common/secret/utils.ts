import z from 'zod';
import {
  CompatibleSecretValueSchema,
  SecretValueParseSchema,
  type ReferenceValue,
  type SecretValueType,
  SecretValueTypeSchema
} from './type';

export type SecretValueReferenceResolver = (ref: ReferenceValue) => unknown;

const ScalarInputValueSchema = z.object({ value: z.union([z.number(), z.boolean()]) }).strict();

/** 凭据识别的唯一入口：先兼容旧数据，再严格校验整个互斥 wrapper。 */
export const parseSecretValue = (value: unknown): SecretValueType | undefined => {
  const parsed = SecretValueParseSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

/** 空明文/密文未配置；数字、布尔值和合法引用已配置。 */
export const isSecretValueConfigured = (value: unknown): boolean => {
  if (ScalarInputValueSchema.safeParse(value).success) return true;
  const secretValue = parseSecretValue(value);
  if (!secretValue) return false;
  if ('ref' in secretValue) return true;
  return ('value' in secretValue ? secretValue.value : secretValue.secret) !== '';
};

/** API 凭据表先归一化旧双字段及空 wrapper，再按当前密钥格式严格校验。 */
export const StoreSecretValueTypeApiInputSchema = z.record(
  z.string(),
  CompatibleSecretValueSchema.pipe(SecretValueTypeSchema)
);

/** 从统一解析结果中提取明文，空字符串仍保留。 */
export const getSecretPlainValue = (value: unknown): string | undefined => {
  const secretValue = parseSecretValue(value);
  return secretValue && 'value' in secretValue ? secretValue.value : undefined;
};

/** 从统一解析结果中提取密文，拒绝 ref 与静态值混用。 */
export const getSecretCipherValue = (value: unknown): string | undefined => {
  const secretValue = parseSecretValue(value);
  return secretValue && 'secret' in secretValue ? secretValue.secret : undefined;
};

/** 提取并校验结构化引用。 */
export const getSecretReferenceValue = (value: unknown): ReferenceValue | undefined => {
  const secretValue = parseSecretValue(value);
  return secretValue && 'ref' in secretValue ? secretValue.ref : undefined;
};

/** 两个凭据编辑器共用引用摘要；历史引用数组保持逐项展示，非法值显示为空。 */
export const formatSecretReference = (value: unknown): string => {
  const reference = getSecretReferenceValue(value);
  if (!reference) return '';
  return Array.isArray(reference[0])
    ? (reference as [string, string][]).map((item) => item.join(' / ')).join(', ')
    : reference.join(' / ');
};
