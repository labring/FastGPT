import { DatasetAuditEventEnum } from '@fastgpt/global/core/dataset/audit/constants/event';
import { DatasetContentAuditActionEnum } from '@fastgpt/global/core/dataset/audit/constants/metadata';
import { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';
import { defaultMetadataProcessor } from '../processors/commonProcessor';

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

/** 对象型配置的子字段分隔符；与 `buildDatasetConfigAuditChanges` 生成格式保持一致。 */
const CHANGE_ITEM_PATH_SEPARATOR = ' · ';

/**
 * 知识库配置变更的 metadata 处理。
 *
 * 两个必须单独处理的点：
 * 1. `changeItem` 是「配置项 i18n key」或「配置项 key · 字段路径」，只翻译前缀；
 * 2. `oldValue` / `newValue` 是用户数据原值，通用 processor 会把任何含 `:` 的字符串
 *    当 key 翻译，导致审计里的 URL（`https://example.com`）被渲染成 `//example.com`。
 */
export const processDatasetConfigUpdateSpecific = (metadata: any, t: any) => {
  const { changeItem, ...rest } = metadata;
  const [itemKey, ...fieldPath] = String(changeItem ?? '').split(CHANGE_ITEM_PATH_SEPARATOR);

  return {
    ...rest,
    changeItem: [itemKey ? t(itemKey) : itemKey, ...fieldPath].join(CHANGE_ITEM_PATH_SEPARATOR)
  };
};

/** 集合审计只翻译已知类型、变更项和启停状态，集合名、标签名及路径始终保留原值。 */
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
  const translateChangeItem = (value: string) => {
    switch (value) {
      case 'account_team:dataset_content_change_item_name':
        return t('account_team:dataset_content_change_item_name');
      case 'account_team:dataset_content_change_item_location':
        return t('account_team:dataset_content_change_item_location');
      case 'account_team:dataset_content_change_item_status':
        return t('account_team:dataset_content_change_item_status');
      default:
        return value;
    }
  };
  const translateStatus = (value: unknown) => {
    switch (value) {
      case 'account_team:dataset_content_status_enabled':
        return t('account_team:dataset_content_status_enabled');
      case 'account_team:dataset_content_status_disabled':
        return t('account_team:dataset_content_status_disabled');
      default:
        return value;
    }
  };

  return {
    ...metadata,
    ...(typeof metadata.objectType === 'string'
      ? { objectType: translateObjectType(metadata.objectType) }
      : {}),
    ...(typeof metadata.changeItem === 'string'
      ? { changeItem: translateChangeItem(metadata.changeItem) }
      : {}),
    ...(metadata.action === DatasetContentAuditActionEnum.ENABLE ||
    metadata.action === DatasetContentAuditActionEnum.DISABLE
      ? {
          oldValue: translateStatus(metadata.oldValue),
          newValue: translateStatus(metadata.newValue)
        }
      : {})
  };
};

export const createDatasetAuditProcessors = {
  UPDATE_DATASET_COLLABORATOR: processUpdateDatasetCollaboratorSpecific,
  [DatasetAuditEventEnum.DATASET_CONFIG_UPDATE]: processDatasetConfigUpdateSpecific,
  [DatasetAuditEventEnum.DATASET_COLLECTION_CREATE]: processDatasetCollectionSpecific,
  [DatasetAuditEventEnum.DATASET_COLLECTION_UPDATE]: processDatasetCollectionSpecific,
  [DatasetAuditEventEnum.DATASET_COLLECTION_EXPORT]: processDatasetCollectionSpecific,
  [DatasetAuditEventEnum.DATASET_COLLECTION_SYNC]: processDatasetCollectionSpecific,
  [DatasetAuditEventEnum.DATASET_COLLECTION_TAG_ADD]: processDatasetCollectionSpecific,
  [DatasetAuditEventEnum.DATASET_COLLECTION_TAG_REMOVE]: processDatasetCollectionSpecific,
  // 父目录缺失时仅在展示层填充占位，避免把知识库名误记为继承来源。
  [DatasetAuditEventEnum.DATASET_COLLECTION_PERMISSION_INHERITANCE_RESUME]: (metadata: any) => ({
    ...metadata,
    parentResource: metadata.parentResource ?? '-'
  })
};
