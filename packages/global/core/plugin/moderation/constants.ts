import { i18nT } from '../../../common/i18n/utils';

/**
 * 内容审查生效环节枚举
 */
export enum ModerationStageEnum {
  entry = 'entry',
  modelInput = 'model_input',
  output = 'output'
}

/**
 * 内容审查最终动作枚举
 * pass: 直接放行；block: 拦截阻断；replace: 替换为统一脱敏文案
 */
export enum ModerationActionEnum {
  pass = 'pass',
  block = 'block',
  replace = 'replace'
}

/** 疑似风险处理策略枚举 */
export enum ModerationRiskActionEnum {
  blockAndLog = 'blockAndLog',
  passAndLog = 'passAndLog'
}

/** 服务异常处理策略枚举 */
export enum ModerationExceptionActionEnum {
  pass = 'pass',
  block = 'block'
}

/** 全局策略记录默认唯一 ID，用于无既有记录时的首次并发竞争 */
export const DEFAULT_MODERATION_POLICY_CONFIG_ID = '000000000000000000000021';

/** 审查插件凭据脱敏占位符 */
export const ModerationSecretMaskedValue = '__fastgpt_masked_secret__';

/** 内容审核违规统一替换文本 */
export const MODERATION_BLOCKED_REPLACE_TEXT = '该信息因内容审核不通过，无法返回';

/** 内容审核违规统一拦截错误提示 */
export const MODERATION_BLOCKED_ERROR_MESSAGE = '内容包含敏感信息，已拦截';

/** 内容审核服务异常统一拦截错误提示 */
export const MODERATION_ERROR_BLOCKED_MESSAGE = '内容审核异常，已拦截';

/**
 * 根据审核裁决结果返回对应的用户侧错误提示文案
 */
export const getModerationBlockErrorMessage = (
  verdict?: 'pass' | 'suspected' | 'block' | 'error'
): string => {
  return verdict === 'error' ? MODERATION_ERROR_BLOCKED_MESSAGE : MODERATION_BLOCKED_ERROR_MESSAGE;
};

/**
 * 判断错误文案是否为内容审核拦截提示
 */
export const isModerationBlockErrorMessage = (message?: string): boolean => {
  return (
    message === MODERATION_BLOCKED_ERROR_MESSAGE || message === MODERATION_ERROR_BLOCKED_MESSAGE
  );
};

/** 归一化审查标签定义 */
export enum ModerationLabelEnum {
  porn = 'porn',
  politics = 'politics',
  terror = 'terror',
  contraband = 'contraband',
  abuse = 'abuse',
  hate = 'hate',
  ad = 'ad',
  advertisingLaw = 'advertising-law',
  privacy = 'privacy',
  flood = 'flood',
  selfHarm = 'self-harm',
  violence = 'violence',
  sexualMinors = 'sexual-minors',
  other = 'other'
}

export const ModerationLabelMap: Record<
  string,
  {
    label: string;
    i18nKey: string;
  }
> = {
  [ModerationLabelEnum.porn]: {
    label: '色情',
    i18nKey: i18nT('admin:moderation.label.porn')
  },
  [ModerationLabelEnum.politics]: {
    label: '涉政',
    i18nKey: i18nT('admin:moderation.label.politics')
  },
  [ModerationLabelEnum.terror]: {
    label: '暴恐',
    i18nKey: i18nT('admin:moderation.label.terror')
  },
  [ModerationLabelEnum.contraband]: {
    label: '违禁',
    i18nKey: i18nT('admin:moderation.label.contraband')
  },
  [ModerationLabelEnum.abuse]: {
    label: '辱骂',
    i18nKey: i18nT('admin:moderation.label.abuse')
  },
  [ModerationLabelEnum.hate]: {
    label: '仇恨',
    i18nKey: i18nT('admin:moderation.label.hate')
  },
  [ModerationLabelEnum.ad]: {
    label: '广告',
    i18nKey: i18nT('admin:moderation.label.ad')
  },
  [ModerationLabelEnum.advertisingLaw]: {
    label: '广告法违规',
    i18nKey: i18nT('admin:moderation.label.advertising_law')
  },
  [ModerationLabelEnum.privacy]: {
    label: '隐私泄露',
    i18nKey: i18nT('admin:moderation.label.privacy')
  },
  [ModerationLabelEnum.flood]: {
    label: '灌水',
    i18nKey: i18nT('admin:moderation.label.flood')
  },
  [ModerationLabelEnum.selfHarm]: {
    label: '自残自杀',
    i18nKey: i18nT('admin:moderation.label.self_harm')
  },
  [ModerationLabelEnum.violence]: {
    label: '暴力血腥',
    i18nKey: i18nT('admin:moderation.label.violence')
  },
  [ModerationLabelEnum.sexualMinors]: {
    label: '涉未成年人',
    i18nKey: i18nT('admin:moderation.label.sexual_minors')
  },
  [ModerationLabelEnum.other]: {
    label: '其他',
    i18nKey: i18nT('admin:moderation.label.other')
  }
};

/**
 * 格式化归一化审查标签，支持传入翻译函数 t
 */
export const formatModerationLabel = (label: string, t?: (key: string) => string): string => {
  const item = ModerationLabelMap[label];
  if (!item) return label;
  if (t) {
    const translated = (() => {
      switch (label) {
        case ModerationLabelEnum.porn:
          return t('admin:moderation.label.porn');
        case ModerationLabelEnum.politics:
          return t('admin:moderation.label.politics');
        case ModerationLabelEnum.terror:
          return t('admin:moderation.label.terror');
        case ModerationLabelEnum.contraband:
          return t('admin:moderation.label.contraband');
        case ModerationLabelEnum.abuse:
          return t('admin:moderation.label.abuse');
        case ModerationLabelEnum.hate:
          return t('admin:moderation.label.hate');
        case ModerationLabelEnum.ad:
          return t('admin:moderation.label.ad');
        case ModerationLabelEnum.advertisingLaw:
          return t('admin:moderation.label.advertising_law');
        case ModerationLabelEnum.privacy:
          return t('admin:moderation.label.privacy');
        case ModerationLabelEnum.flood:
          return t('admin:moderation.label.flood');
        case ModerationLabelEnum.selfHarm:
          return t('admin:moderation.label.self_harm');
        case ModerationLabelEnum.violence:
          return t('admin:moderation.label.violence');
        case ModerationLabelEnum.sexualMinors:
          return t('admin:moderation.label.sexual_minors');
        case ModerationLabelEnum.other:
          return t('admin:moderation.label.other');
        default:
          return undefined;
      }
    })();
    if (translated && translated !== item.i18nKey) {
      return translated;
    }
  }
  return item.label;
};
