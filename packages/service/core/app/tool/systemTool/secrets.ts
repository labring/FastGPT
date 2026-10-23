import { SystemToolSecretMaskedValue } from '@fastgpt/global/core/app/tool/systemTool/constants';
import {
  getSecretPlainValue,
  getSecretValueField,
  hasSecretValueField,
  isSecretCipherValue,
  isSecretValueLike,
  normalizeLegacySecretValue
} from '@fastgpt/global/common/secret/utils';
import { type InputConfigType } from '@fastgpt/global/core/workflow/type/io';
import { decryptSecret, encryptSecret } from '../../../../common/secret/aes256gcm';

type SecretsVal = Record<string, unknown>;

const isMaskedValue = (value: unknown) => value === SystemToolSecretMaskedValue;

const isConfiguredValue = (value: unknown) => {
  if (value === undefined || value === null || value === '') return false;
  if (isMaskedValue(value)) return true;

  if (hasSecretValueField(value, 'ref')) return true;

  if (isSecretValueLike(value)) {
    if (hasSecretValueField(value, 'value')) {
      const plainValue = getSecretPlainValue(value);
      return !hasSecretValueField(value, 'secret') && plainValue !== undefined && plainValue !== '';
    }
    return isSecretCipherValue(value) && getSecretValueField(value, 'secret') !== '';
  }

  return true;
};

const encryptValue = (value: unknown) => {
  if (value === undefined || value === null || value === '') return value;
  if (hasSecretValueField(value, 'ref')) return value;
  if (isSecretValueLike(value)) {
    if (hasSecretValueField(value, 'value') && hasSecretValueField(value, 'secret')) return '';
    const plainValue = getSecretPlainValue(value);
    if (plainValue !== undefined) return { secret: encryptSecret(plainValue) };
    if (isSecretCipherValue(value)) return value;
    return '';
  }

  return {
    secret: encryptSecret(String(value))
  };
};

const decryptValue = (value: unknown) => {
  if (!isSecretValueLike(value)) return value;
  if (hasSecretValueField(value, 'ref')) return value;

  if (hasSecretValueField(value, 'value') && hasSecretValueField(value, 'secret')) return '';
  const plainValue = getSecretPlainValue(value);
  if (plainValue !== undefined) return plainValue;
  if (!isSecretCipherValue(value)) return '';

  try {
    return decryptSecret(value.secret);
  } catch {
    // 无效密文按空值处理，避免单个坏字段阻塞整个工具运行。
    return '';
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

  const result: SecretsVal = Object.fromEntries(
    Object.entries(existingSecretsVal ?? {}).map(([key, value]) => [
      key,
      secretKeys.has(key) ? normalizeLegacySecretValue(value) : value
    ])
  );

  Object.entries(secretsVal).forEach(([key, submittedValue]) => {
    if (!secretKeys.has(key)) {
      result[key] = submittedValue;
      return;
    }

    const value = normalizeLegacySecretValue(submittedValue);

    if (isMaskedValue(value)) {
      const existingValue = result[key];
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
    Object.entries(secretsVal).map(([key, value]) => {
      const normalizedValue = secretKeys.has(key) ? normalizeLegacySecretValue(value) : value;
      return [
        key,
        secretKeys.has(key) &&
        isConfiguredValue(normalizedValue) &&
        !hasSecretValueField(normalizedValue, 'ref')
          ? SystemToolSecretMaskedValue
          : normalizedValue
      ];
    })
  );
};

/** runtime 使用的系统密钥值，解密新格式并保留非密钥字段。 */
export const decryptSystemToolSecrets = (secretsVal?: SecretsVal) => {
  if (!secretsVal) return secretsVal;

  return Object.fromEntries(
    Object.entries(secretsVal).flatMap(([key, value]) => {
      if (isMaskedValue(value)) return [];
      return [[key, decryptValue(normalizeLegacySecretValue(value))]];
    })
  );
};
