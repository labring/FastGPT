import { SystemToolSecretMaskedValue } from '@fastgpt/global/core/app/tool/systemTool/constants';
import { type InputConfigType } from '@fastgpt/global/core/workflow/type/io';
import { decryptSecret, encryptSecret } from '../../../../common/secret/aes256gcm';

type SecretsVal = Record<string, unknown>;

type SecretValueLike = {
  secret?: unknown;
  value?: unknown;
};

const isMaskedValue = (value: unknown) => value === SystemToolSecretMaskedValue;

const isSecretValueLike = (value: unknown): value is SecretValueLike => {
  return typeof value === 'object' && value !== null && ('secret' in value || 'value' in value);
};

const isConfiguredValue = (value: unknown) => {
  if (value === undefined || value === null || value === '') return false;
  if (isMaskedValue(value)) return true;

  if (isSecretValueLike(value)) {
    return (value.value !== undefined && value.value !== '') || !!value.secret;
  }

  return true;
};

const isEncryptedValue = (value: unknown): value is { secret: string; value?: string } => {
  return isSecretValueLike(value) && typeof value.secret === 'string' && value.secret.length > 0;
};

const encryptValue = (value: unknown) => {
  if (value === undefined || value === null || value === '') return value;
  if (isEncryptedValue(value)) return value;

  if (isSecretValueLike(value)) {
    if (typeof value.value !== 'string' || value.value === '') return '';
    return {
      secret: encryptSecret(value.value),
      value: ''
    };
  }

  return {
    secret: encryptSecret(String(value)),
    value: ''
  };
};

const decryptValue = (value: unknown) => {
  if (!isSecretValueLike(value)) return value;

  if (typeof value.value === 'string' && value.value !== '') return value.value;
  if (!isEncryptedValue(value)) return value.value ?? '';

  try {
    return decryptSecret(value.secret);
  } catch {
    // 兼容历史非 AES 密钥结构，避免一次坏字段导致整个工具无法运行。
    return value.value ?? '';
  }
};

/** 从插件 secret schema 生成需要加密的字段集合。 */
export const getSystemToolSecretKeys = (inputList?: InputConfigType[]) =>
  new Set((inputList ?? []).filter((item) => item.inputType === 'secret').map((item) => item.key));

/** 将管理员提交的系统密钥字段加密，并保留未编辑的已有字段。 */
export const encryptSystemToolSecrets = ({
  secretsVal,
  existingSecretsVal,
  secretKeys
}: {
  secretsVal?: SecretsVal | null;
  existingSecretsVal?: SecretsVal;
  secretKeys: Set<string>;
}) => {
  if (secretsVal === null || secretsVal === undefined) return secretsVal;

  const result: SecretsVal = { ...(existingSecretsVal ?? {}) };

  Object.entries(secretsVal).forEach(([key, value]) => {
    if (!secretKeys.has(key)) {
      result[key] = value;
      return;
    }

    if (isMaskedValue(value)) {
      const existingValue = existingSecretsVal?.[key];
      if (isConfiguredValue(existingValue)) {
        result[key] = encryptValue(existingValue);
      } else {
        delete result[key];
      }
      return;
    }

    if (value === undefined || value === null || value === '') {
      delete result[key];
      return;
    }

    result[key] = encryptValue(value);
  });

  return result;
};

/** 管理员详情只返回已配置标记，禁止把系统密钥明文或密文回传给前端。 */
export const maskSystemToolSecrets = ({
  secretsVal,
  secretKeys
}: {
  secretsVal?: SecretsVal;
  secretKeys: Set<string>;
}) => {
  if (!secretsVal) return secretsVal;

  return Object.fromEntries(
    Object.entries(secretsVal).map(([key, value]) => [
      key,
      secretKeys.has(key) && isConfiguredValue(value) ? SystemToolSecretMaskedValue : value
    ])
  );
};

/** runtime 使用的系统密钥值，兼容旧明文并解密新格式。 */
export const decryptSystemToolSecrets = (secretsVal?: SecretsVal) => {
  if (!secretsVal) return secretsVal;

  return Object.fromEntries(
    Object.entries(secretsVal).flatMap(([key, value]) => {
      if (isMaskedValue(value)) return [];
      return [[key, decryptValue(value)]];
    })
  );
};
