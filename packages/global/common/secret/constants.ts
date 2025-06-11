import { i18nT } from '../../../web/i18n/utils';

export enum HeaderSecretTypeEnum {
  Bearer = 'Bearer',
  Basic = 'Basic',
  Custom = 'Custom'
}

export const headerSecretList = [
  {
    title: 'Bearer',
    value: HeaderSecretTypeEnum.Bearer
  },
  {
    title: 'Basic',
    value: HeaderSecretTypeEnum.Basic
  },
  {
    title: i18nT('common:auth_type.Custom'),
    value: HeaderSecretTypeEnum.Custom
  }
];
