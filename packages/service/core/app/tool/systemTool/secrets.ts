import { SystemToolSecretMaskedValue } from '@fastgpt/global/core/app/tool/systemTool/constants';
import {
  getSecretReferenceValue,
  isSecretValueConfigured
} from '@fastgpt/global/common/secret/utils';
import { type InputConfigType } from '@fastgpt/global/core/workflow/type/io';
import { normalizeToolInputValue } from '@fastgpt/global/core/app/tool/systemTool/codec';
import { decryptSecretValue, encryptSecretValue } from '../../../../common/secret/utils';

type SecretsVal = Record<string, unknown>;

const isMaskedValue = (value: unknown) => value === SystemToolSecretMaskedValue;

/** 管理员表单允许提交原始标量；仅在此边界包装明文，凭据识别仍由统一解析器负责。 */
const normalizeSystemToolSecret = (value: unknown) => {
  if (isMaskedValue(value)) return undefined;
  return normalizeToolInputValue({ value, inputType: 'input' });
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

  const result: SecretsVal = { ...existingSecretsVal };

  Object.entries(secretsVal).forEach(([key, submittedValue]) => {
    if (!secretKeys.has(key)) {
      result[key] = submittedValue;
      return;
    }

    if (isMaskedValue(submittedValue)) {
      const existingValue = normalizeSystemToolSecret(result[key]);
      if (isSecretValueConfigured(existingValue)) {
        result[key] = existingValue;
      } else {
        delete result[key];
      }
      return;
    }

    if (submittedValue === undefined || submittedValue === null || submittedValue === '') {
      delete result[key];
      return;
    }

    result[key] = submittedValue;
  });

  // 合并完成后统一保存，未编辑的历史明文也使用同一加密规则。
  return Object.fromEntries(
    Object.entries(result).flatMap(([key, value]) => {
      if (!secretKeys.has(key)) return [[key, value]];
      const secretValue = normalizeSystemToolSecret(value);
      return secretValue ? [[key, encryptSecretValue(secretValue)]] : [];
    })
  );
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
      if (!secretKeys.has(key)) return [key, value];
      const secretValue = normalizeSystemToolSecret(value);
      return [
        key,
        isSecretValueConfigured(secretValue) && !getSecretReferenceValue(secretValue)
          ? SystemToolSecretMaskedValue
          : (secretValue ?? '')
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
      try {
        return [[key, decryptSecretValue(value)]];
      } catch {
        // 系统工具保留历史容错策略；解码和协议判断仍复用通用实现。
        return [[key, '']];
      }
    })
  );
};
