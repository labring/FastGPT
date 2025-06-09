import { HeaderAuthTypeEnum } from '@fastgpt/global/common/teamSecret/constants';
import {
  type StoreHeaderAuthValueType,
  type HeaderAuthConfigType
} from '@fastgpt/global/common/teamSecret/type';

export const formatAuthData = ({
  data,
  prefix = ''
}: {
  data: HeaderAuthConfigType;
  prefix?: string;
}): StoreHeaderAuthValueType => {
  if (!data?.enableAuth) return {};

  const authEntries =
    data.authType === HeaderAuthTypeEnum.Custom && Array.isArray(data.customHeaders)
      ? data.customHeaders
      : data.authType && (data.BearerValue || data.BasicValue)
        ? [
            {
              key: data.authType,
              value:
                data.authType === HeaderAuthTypeEnum.Bearer ? data.BearerValue : data.BasicValue
            }
          ]
        : [];

  return Object.fromEntries(
    authEntries
      .filter(({ key }) => key)
      .map(({ key, value }) => [
        key,
        {
          value: value?.value || '',
          secretId: prefix + (value?.secretId || '')
        }
      ])
  );
};

export const parseAuthData = ({
  data,
  prefix = ''
}: {
  data: Record<string, { value: string; secretId: string }>;
  prefix?: string;
}): HeaderAuthConfigType => {
  if (!data || Object.keys(data).length === 0) {
    return { enableAuth: false, authType: HeaderAuthTypeEnum.Bearer };
  }

  const removePrefix = (secretId: string) => {
    return secretId?.startsWith(prefix) ? secretId.substring(prefix.length) : secretId;
  };

  const entries = Object.entries(data);

  if (entries.length === 1) {
    const [key, value] = entries[0];

    if (key === HeaderAuthTypeEnum.Bearer || key === HeaderAuthTypeEnum.Basic) {
      return {
        enableAuth: true,
        authType: key as HeaderAuthTypeEnum,
        [key === HeaderAuthTypeEnum.Bearer ? 'BearerValue' : 'BasicValue']: {
          secretId: removePrefix(value.secretId),
          value: value.value
        }
      };
    }
  }

  return {
    enableAuth: true,
    authType: HeaderAuthTypeEnum.Custom,
    customHeaders: entries.map(([key, value]) => ({
      key,
      value: {
        secretId: removePrefix(value.secretId),
        value: value.value
      }
    }))
  };
};
