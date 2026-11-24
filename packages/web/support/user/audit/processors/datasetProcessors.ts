import { i18nT } from '@fastgpt/global/common/i18n/utils';
import {
  DATASET_CONFIG_CHANGE_ITEM_SEPARATOR,
  DATASET_CONFIG_SENSITIVE_KEY_PATTERN,
  DatasetConfigAuditItemEnum,
  datasetConfigAuditItemLabelMap
} from '@fastgpt/global/core/dataset/audit/constants/config';
import { DatasetAuditEventEnum } from '@fastgpt/global/core/dataset/audit/constants/event';
import { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';
import { defaultMetadataProcessor, type CommonMetadataFields } from './commonProcessor';

/**
 * 对象型知识库配置中取值为布尔类型的子字段集合（按父配置项 key 分组）。
 * 展示层仅对这些布尔子字段及标量 `autoSync` 翻译 `common:yes` / `common:no`，避免误译自由文本。
 */
export const datasetConfigAuditBooleanFieldMap: Readonly<
  Partial<Record<string, ReadonlySet<string>>>
> = {
  [datasetConfigAuditItemLabelMap[DatasetConfigAuditItemEnum.CHUNK_SETTINGS]]: new Set([
    'dataEnhanceCollectionName',
    'imageIndex',
    'autoIndexes',
    'indexPrefixTitle'
  ]),
  [datasetConfigAuditItemLabelMap[DatasetConfigAuditItemEnum.FILE_PARSE_CONFIG]]: new Set([
    'keep_header_footer',
    'keep_appendix',
    'image_analysis',
    'chart_analysis'
  ])
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

/** 保留知识库类型等通用翻译，并将协作者角色转换为审计列表展示用的权限标记。 */
export const processUpdateDatasetCollaboratorSpecific = (
  metadata: any,
  t: (key: string) => string
) => {
  const formattedMetadata = defaultMetadataProcessor(metadata, t);
  const role = parseInt(metadata.permission, 10);
  const permission = new DatasetPermission({ role });
  return {
    ...formattedMetadata,
    readPermission: permission.hasReadPer ? '✔' : '✘',
    writePermission: permission.hasWritePer ? '✔' : '✘',
    managePermission: permission.hasManagePer ? '✔' : '✘'
  };
};

/**
 * 知识库配置变更的 metadata 处理。
 *
 * 三个展示边界：
 * 1. `changeItem` 为「配置项 i18n key」或「配置项 key · 字段路径」，前缀翻译并按白名单映射已知子字段路径，未知路径原样回退；
 * 2. `oldValue` / `newValue` 按配置项与子路径语义分流：布尔项仅翻译 `common:yes`/`common:no`，
 *    模型项仅对系统兜底（或无 source 标记的历史记录）翻译 `common:UnKnow` 并保留真实同名模型，
 *    敏感子路径统一隐藏新旧值（兼容历史 `[REDACTED]` 记录），其余自由文本原样透传；
 * 3. `datasetName` / `name` 等名称字段直接透传，不走通用 processor。
 */
export const processDatasetConfigUpdateSpecific = (
  metadata: CommonMetadataFields,
  t: (key: string) => string
) => {
  /** 按父配置项查表翻译已知子字段路径，未登记路径原样保留。 */
  const translateFieldPath = (itemKey: string, fieldPath: string) => {
    if (!Object.hasOwn(datasetConfigAuditFieldLabelMap, itemKey)) return fieldPath;
    const fieldLabelMap = datasetConfigAuditFieldLabelMap[itemKey];
    if (!fieldLabelMap || !Object.hasOwn(fieldLabelMap, fieldPath)) return fieldPath;
    return t(fieldLabelMap[fieldPath]);
  };

  /** 按配置项 key 与可选子路径解析展示侧值语义。 */
  const resolveValueKind = (
    itemKey: string,
    fieldPath?: string
  ): 'boolean' | 'model' | 'sensitive' | 'raw' => {
    if (!fieldPath) {
      if (itemKey === datasetConfigAuditItemLabelMap[DatasetConfigAuditItemEnum.AUTO_SYNC]) {
        return 'boolean';
      }
      if (
        itemKey === datasetConfigAuditItemLabelMap[DatasetConfigAuditItemEnum.AGENT_MODEL] ||
        itemKey === datasetConfigAuditItemLabelMap[DatasetConfigAuditItemEnum.VLM_MODEL]
      ) {
        return 'model';
      }
      return 'raw';
    }

    if (
      fieldPath.split('.').some((segment) => DATASET_CONFIG_SENSITIVE_KEY_PATTERN.test(segment))
    ) {
      return 'sensitive';
    }

    if (
      Object.hasOwn(datasetConfigAuditBooleanFieldMap, itemKey) &&
      datasetConfigAuditBooleanFieldMap[itemKey]?.has(fieldPath)
    ) {
      return 'boolean';
    }

    return 'raw';
  };

  const { changeItem, oldValue, newValue, ...rest } = metadata;
  const [itemKey, ...fieldPathParts] = String(changeItem ?? '').split(
    DATASET_CONFIG_CHANGE_ITEM_SEPARATOR
  );
  const rawFieldPath =
    fieldPathParts.length > 0
      ? fieldPathParts.join(DATASET_CONFIG_CHANGE_ITEM_SEPARATOR)
      : undefined;
  const translatedItem = itemKey ? t(itemKey) : itemKey;
  const formattedChangeItem =
    rawFieldPath !== undefined
      ? `${translatedItem}${DATASET_CONFIG_CHANGE_ITEM_SEPARATOR}${translateFieldPath(
          itemKey,
          rawFieldPath
        )}`
      : translatedItem;

  const valueKind = resolveValueKind(itemKey, rawFieldPath);

  // 敏感配置变更不展示新旧值（同时屏蔽历史上已落库的 `[REDACTED]` 对比）。
  if (valueKind === 'sensitive') {
    return {
      ...rest,
      changeItem: formattedChangeItem
    };
  }

  /** 仅使用静态字面量翻译当前字段语义允许的系统占位值，避免误译同名自由文本或真实模型名。 */
  const translateConfigValue = (value: unknown, source: unknown) => {
    if (typeof value !== 'string') return value;
    if (valueKind === 'boolean') {
      if (value === 'common:yes') return t('common:yes');
      if (value === 'common:no') return t('common:no');
      return value;
    }
    if (valueKind === 'model') {
      // 新记录由写入端显式标明 literal / fallback；历史记录无 source 字段时兼容旧兜底值。
      if (source !== 'literal' && value === 'common:UnKnow') {
        return t('common:UnKnow');
      }
      return value;
    }
    return value;
  };

  return {
    ...rest,
    changeItem: formattedChangeItem,
    ...('oldValue' in metadata && {
      oldValue: translateConfigValue(oldValue, metadata.oldValueSource)
    }),
    ...('newValue' in metadata && {
      newValue: translateConfigValue(newValue, metadata.newValueSource)
    })
  };
};

/** 集合创建审计只翻译已知的 7 种集合对象类型，未知类型与路径原文保留。 */
export const processDatasetCollectionSpecific = (metadata: any, t: (key: string) => string) => {
  // 有限枚举保留字面量调用，静态 i18n 扫描无需依赖服务端同步声明翻译标记。
  const translateObjectType = (value: string) => {
    switch (value) {
      case 'common:core.dataset.folder':
        return t('common:core.dataset.folder');
      case 'common:core.dataset.file':
        return t('common:core.dataset.file');
      case 'common:core.dataset.externalFile':
        return t('common:core.dataset.externalFile');
      case 'common:core.dataset.link':
        return t('common:core.dataset.link');
      case 'dataset:empty_collection':
        return t('dataset:empty_collection');
      case 'common:core.dataset.apiFile':
        return t('common:core.dataset.apiFile');
      case 'dataset:core.dataset.Image collection':
        return t('dataset:core.dataset.Image collection');
      default:
        return value;
    }
  };

  return {
    ...metadata,
    ...(typeof metadata.objectType === 'string'
      ? { objectType: translateObjectType(metadata.objectType) }
      : {})
  };
};

export const createDatasetAuditProcessors = {
  UPDATE_DATASET_COLLABORATOR: processUpdateDatasetCollaboratorSpecific,
  [DatasetAuditEventEnum.DATASET_CONFIG_UPDATE]: processDatasetConfigUpdateSpecific,
  [DatasetAuditEventEnum.DATASET_COLLECTION_CREATE]: processDatasetCollectionSpecific,
  // 父目录缺失时仅在展示层填充占位，避免把知识库名误记为继承来源。
  [DatasetAuditEventEnum.DATASET_COLLECTION_PERMISSION_INHERITANCE_RESUME]: (metadata: any) => ({
    ...metadata,
    parentResource: metadata.parentResource ?? '-'
  })
};
