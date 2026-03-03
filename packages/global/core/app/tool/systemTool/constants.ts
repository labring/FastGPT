import { i18nT } from '../../../../../web/i18n/utils';

export enum SystemToolSecretInputTypeEnum {
  system = 'system',
  team = 'team',
  manual = 'manual'
}
export const SystemToolSecretInputTypeMap = {
  [SystemToolSecretInputTypeEnum.system]: {
    text: i18nT('common:System')
  },
  [SystemToolSecretInputTypeEnum.team]: {
    text: i18nT('common:Team')
  },
  [SystemToolSecretInputTypeEnum.manual]: {
    text: i18nT('common:Manual')
  }
};
