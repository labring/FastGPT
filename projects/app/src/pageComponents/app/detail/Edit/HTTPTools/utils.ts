import type { StoreSecretValueType } from '@fastgpt/global/common/secret/type';

export type CustomHeaderItem = {
  key: string;
  value: string;
  secretKey?: string;
  edited?: boolean;
};

/** 把独立 HTTP 节点的请求头值移入服务端可加密的密钥字段，并保留未修改的密文。 */
export const buildWorkflowCustomHeaders = ({
  headers,
  storedSecrets
}: {
  headers: CustomHeaderItem[];
  storedSecrets: StoreSecretValueType;
}) => {
  const customHeaderValues: Record<string, string> = {};
  const headerSecret: StoreSecretValueType = {};

  headers.forEach(({ key, value, secretKey, edited }) => {
    if (!key) return;
    customHeaderValues[key] = '';

    if (value) {
      headerSecret[key] = { value, secret: '' };
      return;
    }
    if (!secretKey || edited) return;

    const storedValue = storedSecrets[secretKey];
    if (storedValue?.secret || storedValue?.value) {
      headerSecret[key] = storedValue;
    }
  });

  return {
    customHeaders: JSON.stringify(customHeaderValues, null, 2),
    headerSecret
  };
};
