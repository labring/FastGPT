import { DatasetCollectionTypeMap } from '@fastgpt/global/core/dataset/constants';
import {
  DatasetContentAuditActionEnum,
  type DatasetContentAuditAction
} from '@fastgpt/global/core/dataset/audit/constants/metadata';
import type { CollectionWithDatasetType } from '@fastgpt/global/core/dataset/type';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { type ClientSession } from '../../../common/mongo';
import { getDatasetCollectionPaths } from '../collection/paths';

/**
 * 根据更新前的集合快照生成属性变更条目，不执行日志写入。
 * 未提交或未变化的字段跳过；移动路径由调用方在写入前取快照，避免旧路径被更新覆盖。
 */
export const buildCollectionUpdateAuditChanges = ({
  collection,
  update,
  move
}: {
  collection: Pick<CollectionWithDatasetType, 'name' | 'forbid'>;
  update: { name?: string; forbid?: boolean };
  move?: { oldPath: string; newPath: string };
}) => {
  const changes: Array<{
    action: DatasetContentAuditAction;
    changeItem: string;
    oldValue: string;
    newValue: string;
  }> = [];

  if (update.name && update.name !== collection.name) {
    changes.push({
      action: DatasetContentAuditActionEnum.RENAME,
      changeItem: i18nT('account_team:dataset_content_change_item_name'),
      oldValue: collection.name,
      newValue: update.name
    });
  }

  if (update.forbid !== undefined && update.forbid !== Boolean(collection.forbid)) {
    changes.push({
      action: update.forbid
        ? DatasetContentAuditActionEnum.DISABLE
        : DatasetContentAuditActionEnum.ENABLE,
      changeItem: i18nT('account_team:dataset_content_change_item_status'),
      oldValue: collection.forbid
        ? i18nT('account_team:dataset_content_status_disabled')
        : i18nT('account_team:dataset_content_status_enabled'),
      newValue: update.forbid
        ? i18nT('account_team:dataset_content_status_disabled')
        : i18nT('account_team:dataset_content_status_enabled')
    });
  }

  if (move) {
    changes.push({
      action: DatasetContentAuditActionEnum.MOVE,
      changeItem: i18nT('account_team:dataset_content_change_item_location'),
      oldValue: move.oldPath,
      newValue: move.newPath
    });
  }

  return changes;
};

/** 未知集合类型没有展示名，回退原始枚举值，避免审计里出现空对象类型。 */
export const getCollectionAuditObjectType = (type: string): string =>
  DatasetCollectionTypeMap[type as keyof typeof DatasetCollectionTypeMap]?.name ?? type;

/**
 * 生成集合审计日志的位置字段（`知识库名/父目录/子目录`），不包含集合自身。
 *
 * 位置只服务于日志展示，取路径失败不能影响主流程，因此这里吞掉查询异常并退回知识库名。
 * 更新审计可传入 session，让祖先目录与集合属性共用同一事务快照。
 */
export const getCollectionAuditLocation = async ({
  datasetName,
  parentId,
  teamId,
  datasetId,
  session
}: {
  datasetName: string;
  parentId?: string | null;
  teamId: string;
  datasetId: string;
  session?: ClientSession;
}): Promise<string> => {
  const paths = await getDatasetCollectionPaths({
    parentId: parentId ?? undefined,
    teamId,
    datasetId,
    session
  }).catch(() => []);
  return [datasetName, ...paths.map((path) => path.parentName)].filter(Boolean).join('/');
};
