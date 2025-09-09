export type SecretValueType = {
  value: string;
  secret: string;
};

export type StoreSecretValueType = Record<string, SecretValueType>;
