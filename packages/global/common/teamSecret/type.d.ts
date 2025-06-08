import type { TeamSecretTypeEnum } from './constants';

export type TeamSecretType = {
  sourceId: string;
  type: TeamSecretTypeEnum;
  value: string;
};

export type HeaderAuthValueType = {
  secretId: string;
  value: string;
};

export type HeaderAuthConfigType = {
  enableAuth: boolean;
  authType: HeaderAuthTypeEnum;
  BearerValue?: HeaderAuthValueType;
  BasicValue?: HeaderAuthValueType;
  customHeaders?: {
    key: string;
    value: HeaderAuthValueType;
  }[];
};
