import { decryptSecret, encryptSecret } from './aes256gcm';
import type { SecretValueType } from '@fastgpt/global/common/secret/type';
import { type StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import { HeaderSecretTypeEnum } from '@fastgpt/global/common/secret/constants';
import { isSecretValue } from '../../../global/common/secret/utils';

export const encryptSecretValue = (value: SecretValueType): SecretValueType => {
  if (typeof value !== 'object' || value === null) return value;
  if (!value.value) {
    return value;
  }

  return {
    secret: encryptSecret(value.value),
    value: ''
  };
};

export const storeSecretValue = (storeSecret: StoreSecretValueType = {}): StoreSecretValueType => {
  return Object.fromEntries(
    Object.entries(storeSecret).map(([key, value]) => {
      return [key, encryptSecretValue(value)];
    })
  );
};

export const getSecretValue = ({
  storeSecret
}: {
  storeSecret?: StoreSecretValueType;
}): Record<string, string> => {
  if (!storeSecret) return {};

  return Object.entries(storeSecret).reduce((acc: Record<string, string>, [key, val]) => {
    if (typeof val !== 'object') {
      return acc;
    }

    const { secret, value } = val;
    const actualValue = value || decryptSecret(secret);

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
  const val = (() => {
    try {
      return JSON.parse(value);
    } catch (error) {
      return value;
    }
  })();

  if (typeof val === 'object' && val !== null && val.value) {
    return val.value;
  }

  if (!isSecretValue(val)) return val;

  return decryptSecret(val.secret);
};
