import type { SecretTypeEnum } from './constants';

export type SecretType = {
  sourceId: string;
  type: SecretTypeEnum;
  value: string;
};

export type SecretValueType = {
  secretId: string;
  value: string;
};

export type StoreSecretValueType = {
  [key: string]: SecretValueType;
};

export type HeaderAuthConfigType = {
  enableAuth: boolean;
  BearerValue?: SecretValueType;
  BasicValue?: SecretValueType;
  customHeaders?: {
    key: string;
    value: SecretValueType;
  }[];
};
