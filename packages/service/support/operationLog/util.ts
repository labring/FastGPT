import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';

export function getI18nAppType(type: AppTypeEnum): string {
  if (type === AppTypeEnum.folder) return 'app:type.Folder';
  if (type === AppTypeEnum.simple) return 'app:type.Simple bot';
  if (type === AppTypeEnum.workflow) return 'app:type.Workflow bot';
  if (type === AppTypeEnum.plugin) return 'app:type.Plugin';
  if (type === AppTypeEnum.httpPlugin) return 'app:type.Http plugin';
  if (type === AppTypeEnum.toolSet) return 'app:type.Tool set';
  if (type === AppTypeEnum.tool) return 'app:type.Tool';
  return 'app:type.Unknown';
}

export function getI18nCollaboratorItemType(
  tmbId: string | undefined,
  groupId: string | undefined,
  orgId: string | undefined
): string {
  if (tmbId) return 'common:log.member';
  if (groupId) return 'common:log.group';
  if (orgId) return 'common:log.department';
  return 'common:log.unknown';
}

export function getI18nDatasetType(type: DatasetTypeEnum | string): string {
  if (type === DatasetTypeEnum.folder) return 'dataset:folder_dataset';
  if (type === DatasetTypeEnum.dataset) return 'dataset:common_dataset';
  if (type === DatasetTypeEnum.websiteDataset) return 'dataset:website_dataset';
  if (type === DatasetTypeEnum.externalFile) return 'dataset:external_file';
  if (type === DatasetTypeEnum.apiDataset) return 'dataset:api_file';
  if (type === DatasetTypeEnum.feishu) return 'dataset:feishu_dataset';
  if (type === DatasetTypeEnum.yuque) return 'dataset:yuque_dataset';
  return 'dataset:unknown_type';
}
