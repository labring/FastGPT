import { decryptSecret, encryptSecret } from './aes256gcm';
import {
  parseSecretValue,
  type SecretValueReferenceResolver
} from '@fastgpt/global/common/secret/utils';
import type { SecretValueType, StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import { HeaderSecretTypeEnum } from '@fastgpt/global/common/secret/constants';

/** 解码静态凭据；引用保留为规范 wrapper，普通标量和业务对象原样透传。 */
export const decryptSecretValue = (value: unknown) => {
  const secretValue = parseSecretValue(value);
  if (!secretValue) return value;
  if ('value' in secretValue) return secretValue.value;
  if ('secret' in secretValue) return decryptSecret(secretValue.secret);
  return secretValue;
};

/** 读取静态 wrapper 或工作流 ref；ref 缺少工作流上下文时显式失败。 */
export const resolveSecretValue = ({
  value,
  resolveReference
}: {
  value: unknown;
  resolveReference?: SecretValueReferenceResolver;
}) => {
  const secretValue = parseSecretValue(value);
  if (secretValue && 'ref' in secretValue) {
    if (!resolveReference) {
      throw new Error('Secret reference requires workflow context');
    }
    const resolvedValue = resolveReference(secretValue.ref);
    if (resolvedValue === undefined) {
      throw new Error(`Secret reference ${JSON.stringify(secretValue.ref)} resolved to undefined`);
    }
    return resolvedValue;
  }

  return decryptSecretValue(secretValue ?? value);
};

/** 静态明文统一在这里加密；空值保持未配置，密文和引用均不重复加密。 */
export const encryptSecretValue = (value: SecretValueType): SecretValueType => {
  const secretValue = parseSecretValue(value);
  if (!secretValue) return value;
  if (!('value' in secretValue) || secretValue.value === '') return secretValue;
  return { secret: encryptSecret(secretValue.value) };
};

/** 保存已确认的凭据表；每项共用明文加密、密文保留及引用保留规则。 */
export const storeSecretValue = (storeSecret: StoreSecretValueType = {}): StoreSecretValueType => {
  return Object.fromEntries(
    Object.entries(storeSecret).map(([key, value]) => {
      return [key, encryptSecretValue(value)];
    })
  );
};

/** 解析鉴权凭据表，忽略非法或空项；引用须提供工作流上下文并解析为字符串。 */
export const getSecretValue = ({
  storeSecret,
  resolveReference
}: {
  storeSecret?: StoreSecretValueType;
  resolveReference?: SecretValueReferenceResolver;
}): Record<string, string> => {
  if (!storeSecret) return {};

  return Object.entries(storeSecret).reduce((acc: Record<string, string>, [key, val]) => {
    const secretValue = parseSecretValue(val);
    if (!secretValue) return acc;
    const actualValue = resolveSecretValue({ value: secretValue, resolveReference });

    if (typeof actualValue !== 'string') {
      throw new Error(`Secret header ${key || '<empty>'} must resolve to a string`);
    }

    // Filter out empty values to avoid invalid headers
    if (!actualValue || !key) {
      return acc;
    }

    if (key === HeaderSecretTypeEnum.Bearer) {
      acc['Authorization'] = `Bearer ${actualValue}`;
    } else if (key === HeaderSecretTypeEnum.Basic) {
      acc['Authorization'] = `Basic ${actualValue}`;
    } else {
      acc[key] = actualValue;
    }

    return acc;
  }, {});
};

/** 兼容旧请求中的 JSON 编码值；凭据分支判断和解密复用统一解码器。 */
export const anyValueDecrypt = (value: any) => {
  const val = (() => {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  })();

  return decryptSecretValue(val);
};
