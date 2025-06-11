export type SecretValueType = {
  value: string;
  secret: string;
};

export type StoreSecretValueType = {
  [key: string]: SecretValueType;
};
