import { i18nT } from '../../../../web/i18n/utils';

export enum SystemToolInputTypeEnum {
  system = 'system',
  team = 'team',
  manual = 'manual'
}
export const SystemToolInputTypeMap = {
  [SystemToolInputTypeEnum.system]: {
    text: i18nT('common:System')
  },
  [SystemToolInputTypeEnum.team]: {
    text: i18nT('common:Team')
  },
  [SystemToolInputTypeEnum.manual]: {
    text: i18nT('common:Manual')
  }
};
