import { DatasetAuditEventEnum } from '@fastgpt/global/core/dataset/audit/constants/event';
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

export const createDatasetAuditProcessors = {
  UPDATE_DATASET_COLLABORATOR: processUpdateDatasetCollaboratorSpecific,
  [DatasetAuditEventEnum.DATASET_CONFIG_UPDATE]: processDatasetConfigUpdateSpecific
};
