import { i18nT } from '../../../../common/i18n/utils';
import { i18nT } from '../../../../../web/i18n/utils';
/**
 * 系统插件密钥来源
 */
export enum SystemToolSecretInputTypeEnum {
  /** 系统密钥 */
  system = 'system',
  /** 团队密钥
   * @unimplemented
   */
  team = 'team',
  /**
   * 自定义的
   */
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
