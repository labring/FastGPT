import { i18nT } from '../../../../common/i18n/utils';
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

export enum SystemToolSystemSecretStatusEnum {
  none = 'none',
  configured = 'configured',
  unconfigured = 'unconfigured'
}

/** 管理员配置页使用的 write-only 标记，表示该字段已有系统密钥但不回显密文。 */
export const SystemToolSecretMaskedValue = '__FASTGPT_SYSTEM_SECRET_MASKED__';
