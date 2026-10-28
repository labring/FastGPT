import z from 'zod';
import { SecretValueTypeSchema, type ReferenceValue, type SecretValueType } from './type';

export type SecretValueReferenceResolver = (ref: ReferenceValue) => unknown;

type SecretValueParseOptions = {
  /** 仅在元数据已确认的凭据容器及兼容 API 边界接纳旧空 wrapper。 */
  allowEmptyLegacy?: boolean;
};

/**
 * 仅在已知凭据边界归一化历史 wrapper；非空明文优先，否则保留密文。
 * 兼容序列化凭据及旧版可选字段，不改写附带业务字段的普通对象。
 */
export const normalizeLegacySecretValue = <T>(
  value: T,
  { allowEmptyLegacy = false }: SecretValueParseOptions = {}
): T | SecretValueType => {
  const isRecord = (candidate: unknown): candidate is Record<string, unknown> =>
    typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate);

  let candidate: unknown = value;
  if (typeof value === 'string') {
    try {
      candidate = JSON.parse(value);
    } catch {
      return value;
    }
  }

  if (!isRecord(candidate)) return value;

  const record = candidate;
  const keys = Object.keys(record);
  if (
    (keys.length > 0 || allowEmptyLegacy) &&
    keys.every((key) => key === 'value' || key === 'secret') &&
    (record.value === undefined || typeof record.value === 'string') &&
    (record.secret === undefined || typeof record.secret === 'string')
  ) {
    if (typeof record.value === 'string' && record.value !== '') {
      return { value: record.value };
    }
    if (typeof record.secret === 'string') return { secret: record.secret };
    if (typeof record.value === 'string') return { value: record.value };
    if (allowEmptyLegacy) return { value: '' };
  }

  // JSON 字符串只在整个对象符合当前协议时解包，不能按单个 ref 字段猜测。
  if (typeof value === 'string') {
    const parsed = SecretValueTypeSchema.safeParse(candidate);
    if (parsed.success) return parsed.data;
  }

  return value;
};

/** 凭据识别的唯一入口：先兼容旧数据，再严格校验整个互斥 wrapper。 */
export const parseSecretValue = (
  value: unknown,
  options?: SecretValueParseOptions
): SecretValueType | undefined => {
  const parsed = SecretValueTypeSchema.safeParse(normalizeLegacySecretValue(value, options));
  return parsed.success ? parsed.data : undefined;
};

/** 配置状态只看合法来源：空明文/密文未配置，合法引用已绑定；引用可用性由工作流检查。 */
export const isSecretValueConfigured = (value: unknown): boolean => {
  const secretValue = parseSecretValue(value);
  if (!secretValue) return false;
  if ('ref' in secretValue) return true;
  return ('value' in secretValue ? secretValue.value : secretValue.secret) !== '';
};

/** API 凭据表先归一化旧双字段及空 wrapper，再按当前密钥格式严格校验。 */
export const StoreSecretValueTypeApiInputSchema = z.record(
  z.string(),
  z.preprocess(
    (value) => normalizeLegacySecretValue(value, { allowEmptyLegacy: true }),
    SecretValueTypeSchema
  )
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
