import { decryptSecret, encryptSecret } from './aes256gcm';
import {
  getSecretPlainValue,
  getSecretReferenceValue,
  getSecretValueField,
  hasSecretValueField,
  normalizeLegacySecretValue,
  type SecretValueReferenceResolver
} from '@fastgpt/global/common/secret/utils';
import type { SecretValueType, StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import { HeaderSecretTypeEnum } from '@fastgpt/global/common/secret/constants';

/** 读取静态 wrapper 或工作流 ref；ref 缺少工作流上下文时显式失败。 */
export const resolveSecretValue = ({
  value,
  resolveReference
}: {
  value: unknown;
  resolveReference?: SecretValueReferenceResolver;
}) => {
  const normalizedValue = normalizeLegacySecretValue(value);
  if (typeof normalizedValue !== 'object' || normalizedValue === null) return normalizedValue;

  if (hasSecretValueField(normalizedValue, 'ref')) {
    const ref = getSecretReferenceValue(normalizedValue);
    if (!ref) throw new Error('Invalid secret reference');
    if (!resolveReference) {
      throw new Error('Secret reference requires workflow context');
    }
    const resolvedValue = resolveReference(ref);
    if (resolvedValue === undefined) {
      throw new Error(`Secret reference ${JSON.stringify(ref)} resolved to undefined`);
    }
    return resolvedValue;
  }

  if (hasSecretValueField(normalizedValue, 'value')) {
    return getSecretValueField(normalizedValue, 'value');
  }

  if (hasSecretValueField(normalizedValue, 'secret')) {
    const secret = getSecretValueField(normalizedValue, 'secret');
    return decryptSecret(typeof secret === 'string' ? secret : undefined);
  }

  return normalizedValue;
};

export const encryptSecretValue = (value: SecretValueType): SecretValueType => {
  const normalizedValue = normalizeLegacySecretValue(value);
  if (typeof normalizedValue !== 'object' || normalizedValue === null) return normalizedValue;
  if (hasSecretValueField(normalizedValue, 'ref')) return normalizedValue;
  if (hasSecretValueField(normalizedValue, 'value')) {
    const plainValue = getSecretPlainValue(normalizedValue);
    // 空明文表示未配置；加密后非空密文会绕过必填校验。
    if (plainValue === undefined || plainValue === '') return value;
    return {
      secret: encryptSecret(plainValue)
    };
  }

  return normalizedValue;
};

export const storeSecretValue = (storeSecret: StoreSecretValueType = {}): StoreSecretValueType => {
  return Object.fromEntries(
    Object.entries(storeSecret).map(([key, value]) => {
      return [key, encryptSecretValue(value)];
    })
  );
};

export const getSecretValue = ({
  storeSecret,
  resolveReference
}: {
  storeSecret?: StoreSecretValueType;
  resolveReference?: SecretValueReferenceResolver;
}): Record<string, string> => {
  if (!storeSecret) return {};

  return Object.entries(storeSecret).reduce((acc: Record<string, string>, [key, val]) => {
    if (typeof val !== 'object' || val === null) {
      return acc;
    }

    const actualValue = resolveSecretValue({ value: val, resolveReference });

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

export const anyValueDecrypt = (value: any) => {
  const normalizedValue = normalizeLegacySecretValue(value);
  const val = (() => {
    try {
      return JSON.parse(normalizedValue);
    } catch {
      return normalizedValue;
    }
  })();

  if (typeof val !== 'object' || val === null) return val;
  if (hasSecretValueField(val, 'ref')) return val;
  if (hasSecretValueField(val, 'value')) return getSecretValueField(val, 'value');
  if (hasSecretValueField(val, 'secret')) {
    const secret = getSecretValueField(val, 'secret');
    return decryptSecret(typeof secret === 'string' ? secret : undefined);
  }
  return val;
};
