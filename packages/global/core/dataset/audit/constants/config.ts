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

/** 对象型配置项与子字段路径的分隔符，写入侧与展示侧共用。 */
export const DATASET_CONFIG_CHANGE_ITEM_SEPARATOR = ' · ';

/** 敏感配置落库时的脱敏占位符，写入侧与展示侧共用。 */
export const DATASET_CONFIG_REDACTED_VALUE = '[REDACTED]';

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
  [DatasetConfigAuditItemEnum.CHUNK_SETTINGS]: i18nT(
    'account_team:dataset_config_item_chunkSettings'
  ),
  [DatasetConfigAuditItemEnum.FILE_PARSE_CONFIG]: i18nT(
    'account_team:dataset_config_item_fileParseConfig'
  )
};

/**
 * 审计变更值（oldValue / newValue）中允许在展示层翻译的系统占位白名单。
 * 仅对明确登记的系统值做翻译，防止用户输入的 URL（含 `:`）或业务文本被误当作 i18n key。
 */
export const datasetConfigAuditValueLabelMap: Readonly<Record<string, string>> = {
  [i18nT('common:yes')]: i18nT('common:yes'),
  [i18nT('common:no')]: i18nT('common:no'),
  [i18nT('common:UnKnow')]: i18nT('common:UnKnow'),
  [DATASET_CONFIG_REDACTED_VALUE]: i18nT('account_team:dataset_config_value_redacted')
};

/**
 * 对象型知识库配置的子字段路径到 i18n key 的映射表（按父配置项 key 分组）。
 * 展示层查表翻译，未匹配到的未知路径或扩展字段原样回退显示。
 */
export const datasetConfigAuditFieldLabelMap: Readonly<
  Partial<Record<string, Readonly<Record<string, string>>>>
> = {
  [datasetConfigAuditItemLabelMap[DatasetConfigAuditItemEnum.WEBSITE_CONFIG]]: {
    url: i18nT('account_team:dataset_config_field_websiteConfig_url'),
    selector: i18nT('account_team:dataset_config_field_websiteConfig_selector')
  },
  [datasetConfigAuditItemLabelMap[DatasetConfigAuditItemEnum.CHUNK_SETTINGS]]: {
    trainingType: i18nT('account_team:dataset_config_field_chunkSettings_trainingType'),
    chunkTriggerType: i18nT('account_team:dataset_config_field_chunkSettings_chunkTriggerType'),
    chunkTriggerMinSize: i18nT(
      'account_team:dataset_config_field_chunkSettings_chunkTriggerMinSize'
    ),
    dataEnhanceCollectionName: i18nT(
      'account_team:dataset_config_field_chunkSettings_dataEnhanceCollectionName'
    ),
    imageIndex: i18nT('account_team:dataset_config_field_chunkSettings_imageIndex'),
    autoIndexes: i18nT('account_team:dataset_config_field_chunkSettings_autoIndexes'),
    indexPrefixTitle: i18nT('account_team:dataset_config_field_chunkSettings_indexPrefixTitle'),
    chunkSettingMode: i18nT('account_team:dataset_config_field_chunkSettings_chunkSettingMode'),
    chunkSplitMode: i18nT('account_team:dataset_config_field_chunkSettings_chunkSplitMode'),
    paragraphChunkAIMode: i18nT(
      'account_team:dataset_config_field_chunkSettings_paragraphChunkAIMode'
    ),
    paragraphChunkDeep: i18nT('account_team:dataset_config_field_chunkSettings_paragraphChunkDeep'),
    paragraphChunkMinSize: i18nT(
      'account_team:dataset_config_field_chunkSettings_paragraphChunkMinSize'
    ),
    chunkSize: i18nT('account_team:dataset_config_field_chunkSettings_chunkSize'),
    chunkSplitter: i18nT('account_team:dataset_config_field_chunkSettings_chunkSplitter'),
    indexSize: i18nT('account_team:dataset_config_field_chunkSettings_indexSize'),
    qaPrompt: i18nT('account_team:dataset_config_field_chunkSettings_qaPrompt')
  },
  [datasetConfigAuditItemLabelMap[DatasetConfigAuditItemEnum.API_DATASET_SERVER]]: {
    apiServer: i18nT('account_team:dataset_config_field_apiDatasetServer_apiServer'),
    'apiServer.baseUrl': i18nT(
      'account_team:dataset_config_field_apiDatasetServer_apiServer_baseUrl'
    ),
    'apiServer.authorization': i18nT(
      'account_team:dataset_config_field_apiDatasetServer_apiServer_authorization'
    ),
    'apiServer.basePath': i18nT(
      'account_team:dataset_config_field_apiDatasetServer_apiServer_basePath'
    ),
    feishuServer: i18nT('account_team:dataset_config_field_apiDatasetServer_feishuServer'),
    'feishuServer.appId': i18nT(
      'account_team:dataset_config_field_apiDatasetServer_feishuServer_appId'
    ),
    'feishuServer.appSecret': i18nT(
      'account_team:dataset_config_field_apiDatasetServer_feishuServer_appSecret'
    ),
    'feishuServer.folderToken': i18nT(
      'account_team:dataset_config_field_apiDatasetServer_feishuServer_folderToken'
    ),
    yuqueServer: i18nT('account_team:dataset_config_field_apiDatasetServer_yuqueServer'),
    'yuqueServer.userId': i18nT(
      'account_team:dataset_config_field_apiDatasetServer_yuqueServer_userId'
    ),
    'yuqueServer.token': i18nT(
      'account_team:dataset_config_field_apiDatasetServer_yuqueServer_token'
    ),
    'yuqueServer.basePath': i18nT(
      'account_team:dataset_config_field_apiDatasetServer_yuqueServer_basePath'
    ),
    dingtalkServer: i18nT('account_team:dataset_config_field_apiDatasetServer_dingtalkServer'),
    'dingtalkServer.appKey': i18nT(
      'account_team:dataset_config_field_apiDatasetServer_dingtalkServer_appKey'
    ),
    'dingtalkServer.appSecret': i18nT(
      'account_team:dataset_config_field_apiDatasetServer_dingtalkServer_appSecret'
    ),
    'dingtalkServer.userId': i18nT(
      'account_team:dataset_config_field_apiDatasetServer_dingtalkServer_userId'
    ),
    'dingtalkServer.operatorId': i18nT(
      'account_team:dataset_config_field_apiDatasetServer_dingtalkServer_operatorId'
    ),
    'dingtalkServer.workspaceId': i18nT(
      'account_team:dataset_config_field_apiDatasetServer_dingtalkServer_workspaceId'
    ),
    'dingtalkServer.rootNodeId': i18nT(
      'account_team:dataset_config_field_apiDatasetServer_dingtalkServer_rootNodeId'
    ),
    'dingtalkServer.workspaceName': i18nT(
      'account_team:dataset_config_field_apiDatasetServer_dingtalkServer_workspaceName'
    )
  },
  [datasetConfigAuditItemLabelMap[DatasetConfigAuditItemEnum.FILE_PARSE_CONFIG]]: {
    keep_header_footer: i18nT(
      'account_team:dataset_config_field_fileParseConfig_keep_header_footer'
    ),
    keep_appendix: i18nT('account_team:dataset_config_field_fileParseConfig_keep_appendix'),
    image_analysis: i18nT('account_team:dataset_config_field_fileParseConfig_image_analysis'),
    chart_analysis: i18nT('account_team:dataset_config_field_fileParseConfig_chart_analysis')
  }
};
