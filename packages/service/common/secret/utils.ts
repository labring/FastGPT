import { decryptSecret, encryptSecret } from './aes256gcm';
import type { SecretValueType } from '@fastgpt/global/common/secret/type';
import { type StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import { HeaderSecretTypeEnum } from '@fastgpt/global/common/secret/constants';

export const storeSecretValue = (
  storeSecret: StoreSecretValueType = {}
): Record<string, SecretValueType> => {
  return Object.fromEntries(
    Object.entries(storeSecret).map(([key, value]) => [
      key,
      {
        secret: encryptSecret(value.value),
        value: ''
      }
    ])
  );
};

export const getSecretValue = ({
  storeSecret
}: {
  storeSecret?: StoreSecretValueType;
}): Record<string, string> => {
  if (!storeSecret) return {};

  return Object.entries(storeSecret).reduce(
    (acc: Record<string, string>, [key, { secret, value }]) => {
      const actualValue = value || decryptSecret(secret);

      if (key === HeaderSecretTypeEnum.Bearer) {
        acc['Authorization'] = `Bearer ${actualValue}`;
      } else if (key === HeaderSecretTypeEnum.Basic) {
        acc['Authorization'] = `Basic ${actualValue}`;
      } else {
        acc[key] = actualValue;
      }

      return acc;
    },
    {}
  );
};
