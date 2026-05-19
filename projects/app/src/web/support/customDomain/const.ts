import type {
  ProviderEnum,
  CustomDomainStatusEnum
} from '@fastgpt/global/support/customDomain/type';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import type { t } from 'i18next';

export const providerMap = {
  aliyun: i18nT('account_custom_domain:provider.aliyun'),
  tencent: i18nT('account_custom_domain:provider.tencent'),
  volcengine: i18nT('account_custom_domain:provider.volcengine')
} satisfies Record<ProviderEnum, Parameters<typeof t>[0]>;

export const customDomainStatusMap = {
  active: i18nT('account_custom_domain:status.active'),
  inactive: i18nT('account_custom_domain:status.inactive')
} satisfies Record<CustomDomainStatusEnum, Parameters<typeof t>[0]>;
