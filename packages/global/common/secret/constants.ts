import { i18nT } from '../../../web/i18n/utils';

export enum SecretTypeEnum {
  headersAuth = 'headersAuth'
}

export enum HeaderAuthTypeEnum {
  Bearer = 'Bearer',
  Basic = 'Basic',
  Custom = 'Custom'
}

export const headerAuthTypeArray = [
  {
    title: i18nT('common:auth_type.Bearer'),
    value: HeaderAuthTypeEnum.Bearer
  },
  {
    title: i18nT('common:auth_type.Basic'),
    value: HeaderAuthTypeEnum.Basic
  },
  {
    title: i18nT('common:auth_type.Custom'),
    value: HeaderAuthTypeEnum.Custom
  }
];
