import type {
  ProviderEnum,
  CustomDomainStatusEnum
} from '@fastgpt/global/support/customDomain/type';
import type { t } from 'i18next';

export const providerMap = {
  aliyun: 'account:custom_domain.provider.aliyun',
  tencent: 'account:custom_domain.provider.tencent',
  volcengine: 'account:custom_domain.provider.volcengine'
} satisfies Record<ProviderEnum, Parameters<typeof t>[0]>;

export const customDomainStatusMap = {
  active: 'account:custom_domain.status.active',
  inactive: 'account:custom_domain.status.inactive'
} satisfies Record<CustomDomainStatusEnum, Parameters<typeof t>[0]>;
