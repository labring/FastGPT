import {
  DATASET_CONFIG_CHANGE_ITEM_SEPARATOR,
  datasetConfigAuditFieldLabelMap,
  datasetConfigAuditValueLabelMap
} from '@fastgpt/global/core/dataset/audit/constants/config';
import { DatasetAuditEventEnum } from '@fastgpt/global/core/dataset/audit/constants/event';
import { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';
import { defaultMetadataProcessor, type CommonMetadataFields } from './commonProcessor';

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
 * 2. `oldValue` / `newValue` 仅对白名单内的系统占位值（布尔 key、未知模型、敏感脱敏占位）做翻译，
 *    其余用户数据（如含 `:` 的 URL 或业务文本）保持原值，避免被误当作 i18n key；
 * 3. `datasetName` / `name` 等名称字段直接透传，不走通用 processor。
 */
export const processDatasetConfigUpdateSpecific = (
  metadata: CommonMetadataFields,
  t: (key: string) => string
) => {
  /** 仅翻译白名单中登记的系统值，Object.hasOwn 防止原型链键名误命中。 */
  const translateConfigValue = (value: unknown) => {
    if (typeof value !== 'string') return value;
    if (!Object.hasOwn(datasetConfigAuditValueLabelMap, value)) return value;
    return t(datasetConfigAuditValueLabelMap[value]);
  };

  /** 按父配置项查表翻译已知子字段路径，未登记路径原样保留。 */
  const translateFieldPath = (itemKey: string, fieldPath: string) => {
    if (!Object.hasOwn(datasetConfigAuditFieldLabelMap, itemKey)) return fieldPath;
    const fieldLabelMap = datasetConfigAuditFieldLabelMap[itemKey];
    if (!fieldLabelMap || !Object.hasOwn(fieldLabelMap, fieldPath)) return fieldPath;
    return t(fieldLabelMap[fieldPath]);
  };

  const { changeItem, oldValue, newValue, ...rest } = metadata;
  const [itemKey, ...fieldPathParts] = String(changeItem ?? '').split(
    DATASET_CONFIG_CHANGE_ITEM_SEPARATOR
  );
  const translatedItem = itemKey ? t(itemKey) : itemKey;
  const formattedChangeItem =
    fieldPathParts.length > 0
      ? `${translatedItem}${DATASET_CONFIG_CHANGE_ITEM_SEPARATOR}${translateFieldPath(
          itemKey,
          fieldPathParts.join(DATASET_CONFIG_CHANGE_ITEM_SEPARATOR)
        )}`
      : translatedItem;

  return {
    ...rest,
    changeItem: formattedChangeItem,
    ...('oldValue' in metadata && { oldValue: translateConfigValue(oldValue) }),
    ...('newValue' in metadata && { newValue: translateConfigValue(newValue) })
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
