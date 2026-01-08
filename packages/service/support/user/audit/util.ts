import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { i18nT } from '../../../../web/i18n/utils';
import { MongoTeamAudit } from './schema';
import type {
  AdminAuditEventEnum,
  AuditEventEnum,
  AdminAuditEventParamsType,
  AuditEventParamsType
} from '@fastgpt/global/support/user/audit/constants';
import { retryFn } from '@fastgpt/global/common/system/utils';

export function getI18nAppType(type: AppTypeEnum): string {
  if (type === AppTypeEnum.folder) return i18nT('account_team:type.Folder');
  if (type === AppTypeEnum.simple) return i18nT('app:type.Chat_Agent');
  if (type === AppTypeEnum.workflow) return i18nT('account_team:type.Workflow bot');
  if (type === AppTypeEnum.workflowTool) return i18nT('app:toolType_workflow');
  if (type === AppTypeEnum.httpPlugin) return i18nT('account_team:type.Http plugin');
  if (type === AppTypeEnum.httpToolSet) return i18nT('app:toolType_http');
  if (type === AppTypeEnum.mcpToolSet) return i18nT('app:toolType_mcp');
  if (type === AppTypeEnum.tool) return i18nT('app:toolType_mcp');
  return i18nT('common:UnKnow');
}

export function getI18nCollaboratorItemType(
  tmbId: string | undefined,
  groupId: string | undefined,
  orgId: string | undefined
): string {
  if (tmbId) return i18nT('account_team:member');
  if (groupId) return i18nT('account_team:group');
  if (orgId) return i18nT('account_team:department');
  return i18nT('common:UnKnow');
}

export function getI18nDatasetType(type: DatasetTypeEnum | string): string {
  if (type === DatasetTypeEnum.folder) return i18nT('account_team:dataset.folder_dataset');
  if (type === DatasetTypeEnum.dataset) return i18nT('account_team:dataset.common_dataset');
  if (type === DatasetTypeEnum.websiteDataset) return i18nT('account_team:dataset.website_dataset');
  if (type === DatasetTypeEnum.externalFile) return i18nT('account_team:dataset.external_file');
  if (type === DatasetTypeEnum.apiDataset) return i18nT('account_team:dataset.api_file');
  if (type === DatasetTypeEnum.feishu) return i18nT('account_team:dataset.feishu_dataset');
  if (type === DatasetTypeEnum.yuque) return i18nT('account_team:dataset.yuque_dataset');
  return i18nT('common:UnKnow');
}

export function getI18nInformLevel(level: string): string {
  if (level === 'common') return i18nT('account_team:inform_level_common');
  if (level === 'important') return i18nT('account_team:inform_level_important');
  if (level === 'emergency') return i18nT('account_team:inform_level_emergency');
  return i18nT('common:UnKnow');
}

export function addAuditLog<T extends AuditEventEnum>({
  teamId,
  tmbId,
  event,
  params
}: {
  tmbId: string;
  teamId: string;
  event: T;
  params?: AuditEventParamsType[T];
}): void;

export function addAuditLog<T extends AdminAuditEventEnum>({
  teamId,
  tmbId,
  event,
  params
}: {
  tmbId: string;
  teamId: string;
  event: T;
  params?: AdminAuditEventParamsType[T];
}): void;
export function addAuditLog<T extends AuditEventEnum | AdminAuditEventEnum>({
  teamId,
  tmbId,
  event,
  params
}: {
  tmbId: string;
  teamId: string;
  event: T;
  params?: any;
}) {
  retryFn(() =>
    MongoTeamAudit.create({
      tmbId: tmbId,
      teamId: teamId,
      event,
      metadata: params
    })
  );
}
