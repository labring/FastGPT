import { i18nT } from '../../../../common/i18n/utils';

/**
 * 知识库配置项的可审计字段。
 *
 * 值用于标识配置项，审计文案由下方静态标签映射生成；新增配置项时必须同步补齐多语言 key。
 */
export enum DatasetConfigAuditItemEnum {
  NAME = 'name',
  INTRO = 'intro',
  AVATAR = 'avatar',
  AGENT_MODEL = 'agentModel',
  VLM_MODEL = 'vlmModel',
  WEBSITE_CONFIG = 'websiteConfig',
  EXTERNAL_READ_URL = 'externalReadUrl',
  API_DATASET_SERVER = 'apiDatasetServer',
  AUTO_SYNC = 'autoSync',
  SYNC_ALL = 'syncAll',
  CHUNK_SETTINGS = 'chunkSettings',
  FILE_PARSE_CONFIG = 'fileParseConfig'
}

export type DatasetConfigAuditItem = `${DatasetConfigAuditItemEnum}`;

/** 审计配置值的来源标记；用于区分真实模型展示名与目录查不到模型时的系统兜底。 */
export type DatasetConfigAuditValueSource = 'literal' | 'fallback';

/** 对象型配置项与子字段路径的分隔符，写入侧与展示侧共用。 */
export const DATASET_CONFIG_CHANGE_ITEM_SEPARATOR = ' · ';

/**
 * 凭据类字段名匹配规则（写入侧脱敏与展示侧敏感子路径识别共用）。
 * 配置结构会随第三方集成扩展，宁可在少量非敏感字段上隐藏值，也不能漏出一个凭据。
 */
export const DATASET_CONFIG_SENSITIVE_KEY_PATTERN =
  /(token|secret|password|passwd|apikey|api_key|authorization|credential|cookie|privatekey|accesskey|signature)/i;

/**
 * 配置项的静态翻译标记，供审计生成和 i18n 清理脚本共同使用。
 */
export const datasetConfigAuditItemLabelMap: Record<DatasetConfigAuditItem, string> = {
  [DatasetConfigAuditItemEnum.NAME]: i18nT('account_team:dataset_config_item_name'),
  [DatasetConfigAuditItemEnum.INTRO]: i18nT('account_team:dataset_config_item_intro'),
  [DatasetConfigAuditItemEnum.AVATAR]: i18nT('account_team:dataset_config_item_avatar'),
  [DatasetConfigAuditItemEnum.AGENT_MODEL]: i18nT('account_team:dataset_config_item_agentModel'),
  [DatasetConfigAuditItemEnum.VLM_MODEL]: i18nT('account_team:dataset_config_item_vlmModel'),
  [DatasetConfigAuditItemEnum.WEBSITE_CONFIG]: i18nT(
    'account_team:dataset_config_item_websiteConfig'
  ),
  [DatasetConfigAuditItemEnum.EXTERNAL_READ_URL]: i18nT(
    'account_team:dataset_config_item_externalReadUrl'
  ),
  [DatasetConfigAuditItemEnum.API_DATASET_SERVER]: i18nT(
    'account_team:dataset_config_item_apiDatasetServer'
  ),
  [DatasetConfigAuditItemEnum.AUTO_SYNC]: i18nT('account_team:dataset_config_item_autoSync'),
  [DatasetConfigAuditItemEnum.SYNC_ALL]: i18nT('account_team:dataset_config_item_syncAll'),
  [DatasetConfigAuditItemEnum.CHUNK_SETTINGS]: i18nT(
    'account_team:dataset_config_item_chunkSettings'
  ),
  [DatasetConfigAuditItemEnum.FILE_PARSE_CONFIG]: i18nT(
    'account_team:dataset_config_item_fileParseConfig'
  )
};
