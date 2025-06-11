import { decryptSecret, encryptSecret } from './aes256gcm';
import type { SecretValueType} from '@fastgpt/global/common/secret/type';
import { type StoreSecretValueType } from '@fastgpt/global/common/secret/type';

export const storeSecretValue = (
  storeSecret: StoreSecretValueType
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
  storeSecret: StoreSecretValueType;
}): Record<string, string> => {
  if (!storeSecret) return {};

  try {
    return Object.entries(storeSecret).reduce(
      (acc: Record<string, string>, [key, { secret, value }]) => {
        acc[key] = value || decryptSecret(secret);
        return acc;
      },
      {}
    );
  } catch (error) {
    return {};
  }
};
