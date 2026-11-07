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
  CHUNK_SETTINGS = 'chunkSettings',
  FILE_PARSE_CONFIG = 'fileParseConfig'
}

export type DatasetConfigAuditItem = `${DatasetConfigAuditItemEnum}`;

/** 配置项的静态翻译标记，供审计生成和 i18n 清理脚本共同使用。 */
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
  [DatasetConfigAuditItemEnum.CHUNK_SETTINGS]: i18nT(
    'account_team:dataset_config_item_chunkSettings'
  ),
  [DatasetConfigAuditItemEnum.FILE_PARSE_CONFIG]: i18nT(
    'account_team:dataset_config_item_fileParseConfig'
  )
};
