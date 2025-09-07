export type SecretValueType = {
  value: string;
  secret: string;
};

export type StoreSecretValueType = Record<string, SecretValueType>;

export type WecomCrypto = {
  token: string;
  aesKey: string;
  nonce: string;
  streamId: string;
  isFirst: boolean;
};
