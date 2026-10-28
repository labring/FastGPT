import z from 'zod';
import {
  ReferenceValueSchema,
  SecretRefValueSchema,
  SecretValueTypeSchema,
  type ReferenceValue
} from './type';

export type SecretValueLike = {
  value?: unknown;
  secret?: unknown;
  ref?: unknown;
};

export type SecretValueField = keyof SecretValueLike;

export type SecretValueReferenceResolver = (ref: ReferenceValue) => unknown;

/** 判断值是否是包含 value、secret 或 ref 字段的密钥 wrapper。 */
export const isSecretValueLike = (value: unknown): value is SecretValueLike =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  ('value' in value || 'secret' in value || 'ref' in value);

/** 判断 wrapper 是否包含指定字段；字段值本身允许为空。 */
export const hasSecretValueField = <T extends SecretValueField>(
  value: unknown,
  field: T
): value is SecretValueLike & Required<Pick<SecretValueLike, T>> =>
  isSecretValueLike(value) && field in value;

/** 提取 wrapper 的指定字段，不把普通对象误判为密钥值。 */
export const getSecretValueField = <T extends SecretValueField>(
  value: unknown,
  field: T
): SecretValueLike[T] | undefined => (hasSecretValueField(value, field) ? value[field] : undefined);

/** 判断是否是合法的结构化引用 wrapper。 */
export const isSecretReferenceValue = (
  value: unknown
): value is SecretValueLike & { ref: ReferenceValue } =>
  SecretRefValueSchema.safeParse(value).success;

/** 判断 wrapper 是否包含字符串密文；空字符串也属于合法字段形态。 */
export const isSecretCipherValue = (
  value: unknown
): value is SecretValueLike & { secret: string } =>
  typeof getSecretValueField(value, 'secret') === 'string';

/** 判断 wrapper 是否包含字符串明文；空字符串也属于合法字段形态。 */
export const isSecretPlainValue = (value: unknown): value is SecretValueLike & { value: string } =>
  typeof getSecretValueField(value, 'value') === 'string';

/** 提取静态明文值。 */
export const getSecretPlainValue = (value: unknown): string | undefined => {
  const plainValue = getSecretValueField(value, 'value');
  return typeof plainValue === 'string' ? plainValue : undefined;
};

/** @deprecated Remove after legacy dual-field secret wrappers have been migrated. */
export const normalizeLegacySecretValue = <T>(
  value: T
): T | { secret: string } | { value: string } => {
  let candidate: unknown = value;
  if (typeof value === 'string') {
    try {
      candidate = JSON.parse(value);
    } catch {
      return value;
    }
  }

  if (
    hasSecretValueField(candidate, 'value') &&
    hasSecretValueField(candidate, 'secret') &&
    Object.keys(candidate).length === 2 &&
    Object.prototype.hasOwnProperty.call(candidate, 'value') &&
    Object.prototype.hasOwnProperty.call(candidate, 'secret')
  ) {
    if (candidate.value === '' && typeof candidate.secret === 'string') {
      return { secret: candidate.secret };
    }
    if (
      typeof candidate.value === 'string' &&
      candidate.value !== '' &&
      typeof candidate.secret === 'string'
    ) {
      return { value: candidate.value };
    }
  }

  return value;
};

/** API 入参先归一化历史双字段值，再按当前密钥格式严格校验。 */
export const StoreSecretValueTypeApiInputSchema = z.record(
  z.string(),
  z.preprocess(normalizeLegacySecretValue, SecretValueTypeSchema)
);

/** 提取密文值。 */
export const getSecretCipherValue = (value: unknown): string | undefined => {
  const cipherValue = getSecretValueField(value, 'secret');
  return typeof cipherValue === 'string' ? cipherValue : undefined;
};

/** 提取并校验结构化引用。 */
export const getSecretReferenceValue = (value: unknown): ReferenceValue | undefined => {
  const reference = getSecretValueField(value, 'ref');
  const parsed = ReferenceValueSchema.safeParse(reference);
  return parsed.success ? parsed.data : undefined;
};
