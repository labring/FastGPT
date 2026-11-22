import {
  DatasetCollectionTypeMap,
  type DatasetCollectionTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { DatasetAuditEventEnum } from '@fastgpt/global/core/dataset/audit/constants/event';
import type { CollectionWithDatasetType } from '@fastgpt/global/core/dataset/type';
import { buildCollectionAuditResource } from '@fastgpt/global/support/user/audit/type';
import { type ClientSession } from '../../../common/mongo';
import { type AuditLogInput } from '../../../support/user/audit/util';
import { getDatasetCollectionPaths } from '../collection/paths';
import { MongoDatasetCollectionTagsV2 } from '../tag/schemaV2';

export type CollectionUpdateAuditEvent =
  | {
      event: DatasetAuditEventEnum.DATASET_COLLECTION_RENAME;
      params: { oldName: string; newName: string };
    }
  | {
      event:
        | DatasetAuditEventEnum.DATASET_COLLECTION_ENABLE
        | DatasetAuditEventEnum.DATASET_COLLECTION_DISABLE;
      params: Record<string, never>;
    }
  | {
      event: DatasetAuditEventEnum.DATASET_COLLECTION_MOVE;
      params: { oldPath: string; newPath: string };
    };

/**
 * 根据更新前的集合快照生成独立的属性变更事件，不执行日志写入。
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
}): CollectionUpdateAuditEvent[] => {
  const changes: CollectionUpdateAuditEvent[] = [];

  if (update.name && update.name !== collection.name) {
    changes.push({
      event: DatasetAuditEventEnum.DATASET_COLLECTION_RENAME,
      params: {
        oldName: collection.name,
        newName: update.name
      }
    });
  }

  if (update.forbid !== undefined && update.forbid !== Boolean(collection.forbid)) {
    changes.push({
      event: update.forbid
        ? DatasetAuditEventEnum.DATASET_COLLECTION_DISABLE
        : DatasetAuditEventEnum.DATASET_COLLECTION_ENABLE,
      params: {}
    });
  }

  if (move) {
    changes.push({
      event: DatasetAuditEventEnum.DATASET_COLLECTION_MOVE,
      params: {
        oldPath: move.oldPath,
        newPath: move.newPath
      }
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

/**
 * 纯同步组装集合创建审计入参，供已知目录位置的批量建库与异步构造共同复用。
 */
export const formatCollectionCreateAuditLog = ({
  teamId,
  tmbId,
  datasetId,
  collection,
  location
}: {
  teamId: string;
  tmbId: string;
  datasetId: unknown;
  collection: {
    _id: unknown;
    name: string;
    type: DatasetCollectionTypeEnum;
  };
  location: string;
}) => ({
  tmbId,
  teamId,
  event: DatasetAuditEventEnum.DATASET_COLLECTION_CREATE as const,
  resources: [
    buildCollectionAuditResource({
      _id: collection._id,
      datasetId,
      name: collection.name,
      type: collection.type
    })
  ],
  params: {
    objectType: getCollectionAuditObjectType(collection.type),
    location
  }
});

/**
 * 组装集合创建审计入参，复用同一份集合类型快照生成资源、对象类型与目录位置。
 */
export const buildCollectionCreateAuditLog = async ({
  teamId,
  tmbId,
  dataset,
  collection
}: {
  teamId: string;
  tmbId: string;
  dataset: {
    _id: unknown;
    teamId: unknown;
    name: string;
  };
  collection: {
    _id: unknown;
    name: string;
    type: DatasetCollectionTypeEnum;
    parentId?: string | null;
  };
}) =>
  formatCollectionCreateAuditLog({
    teamId,
    tmbId,
    datasetId: dataset._id,
    collection,
    location: await getCollectionAuditLocation({
      datasetName: dataset.name,
      teamId: String(dataset.teamId),
      datasetId: String(dataset._id),
      parentId: collection.parentId
    })
  });

/** 组装查看集合原始内容 / 导出集合问答审计入参，按独立事件与资源团队归属落库。 */
export const buildCollectionExportAuditLog = ({
  tmbId,
  collection,
  event
}: {
  tmbId: string;
  collection: {
    _id: unknown;
    teamId: unknown;
    datasetId: unknown;
    name: string;
    type: DatasetCollectionTypeEnum;
  };
  event:
    | DatasetAuditEventEnum.DATASET_COLLECTION_SOURCE_READ
    | DatasetAuditEventEnum.DATASET_COLLECTION_QA_EXPORT;
}) => ({
  teamId: String(collection.teamId),
  tmbId,
  event,
  resources: [buildCollectionAuditResource(collection)],
  params: {}
});

export type CollectionTagAuditChange = {
  collection: {
    _id: unknown;
    datasetId?: unknown;
    name?: string | null;
    type?: DatasetCollectionTypeEnum;
  };
  addedTagIds: string[];
  removedTagIds: string[];
};

/**
 * 批量组装集合标签增删审计日志。
 *
 * 按变更 tagId 去重查询当前标签名称；查询失败或标签已删除时回退 tagId，
 * 避免已提交的业务写入因审计补充查询而失败。无实际标签变化时直接返回空数组。
 */
export const buildCollectionTagAuditLogs = async ({
  teamId,
  tmbId,
  datasetId,
  changes
}: {
  teamId: string;
  tmbId: string;
  datasetId: unknown;
  changes: CollectionTagAuditChange[];
}): Promise<AuditLogInput[]> => {
  const changedTagIds = [
    ...new Set(changes.flatMap((change) => [...change.addedTagIds, ...change.removedTagIds]))
  ];
  if (changedTagIds.length === 0) return [];

  const tagDocs = await MongoDatasetCollectionTagsV2.find(
    { _id: { $in: changedTagIds }, teamId, datasetId },
    'tag'
  )
    .lean()
    .catch(() => []);
  const tagNameById = new Map(tagDocs.map((tag) => [String(tag._id), tag.tag]));
  const formatTagNames = (tagIds: string[]) =>
    tagIds.map((tagId) => tagNameById.get(tagId) ?? tagId).join(', ');

  const auditLogs: AuditLogInput[] = [];
  for (const { collection, addedTagIds, removedTagIds } of changes) {
    if (addedTagIds.length === 0 && removedTagIds.length === 0) continue;

    const resource = buildCollectionAuditResource({
      ...collection,
      datasetId: collection.datasetId ?? datasetId
    });

    if (addedTagIds.length > 0) {
      auditLogs.push({
        tmbId,
        teamId,
        event: DatasetAuditEventEnum.DATASET_COLLECTION_TAG_ADD,
        resources: [resource],
        params: {
          tagName: formatTagNames(addedTagIds)
        }
      });
    }

    if (removedTagIds.length > 0) {
      auditLogs.push({
        tmbId,
        teamId,
        event: DatasetAuditEventEnum.DATASET_COLLECTION_TAG_REMOVE,
        resources: [resource],
        params: {
          tagName: formatTagNames(removedTagIds)
        }
      });
    }
  }

  return auditLogs;
};
