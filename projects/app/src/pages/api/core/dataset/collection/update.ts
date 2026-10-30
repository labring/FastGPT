import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import {
  createOrGetCollectionTags,
  getCollectionUpdateTime
} from '@fastgpt/service/core/dataset/collection/utils';
import {
  authDataset,
  authDatasetCollection
} from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import {
  ManagePermissionVal,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { DatasetAuditEventEnum } from '@fastgpt/global/core/dataset/audit/constants/event';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { type ClientSession } from '@fastgpt/service/common/mongo';
import { type DatasetCollectionSchemaType } from '@fastgpt/global/core/dataset/type';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { addAuditLogs, type AuditLogInput } from '@fastgpt/service/support/user/audit/util';
import { diffCollectionTags } from '@fastgpt/service/core/dataset/audit/utils';
import { MongoDatasetCollectionTagsV2 } from '@fastgpt/service/core/dataset/tag/schemaV2';
import { UpdateDatasetCollectionBodySchema } from '@fastgpt/global/openapi/core/dataset/collection/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { checkMoveFolderDepth } from '@fastgpt/service/common/parentFolder/depth';
import { moveCollectionPermission } from '@fastgpt/service/support/permission/collection/controller';
import { authDatasetCollectionMove } from '@fastgpt/service/support/permission/collection/moveAuth';
import {
  buildCollectionUpdateAuditChanges,
  getCollectionAuditLocation,
  getCollectionAuditObjectType
} from '@fastgpt/service/core/dataset/audit/collection';

// Set folder collection children forbid status
const updateFolderChildrenForbid = async ({
  collection,
  forbid,
  session
}: {
  collection: Pick<DatasetCollectionSchemaType, '_id' | 'teamId' | 'datasetId'>;
  forbid: boolean;
  session: ClientSession;
}) => {
  // 从 collection 作为 parent 进行递归查找，找到它所有 forbid 与它相同的 child
  const find = async (parentId: string): Promise<string[]> => {
    const children = await MongoDatasetCollection.find(
      {
        teamId: collection.teamId,
        datasetId: collection.datasetId,
        parentId
      },
      '_id',
      { session }
    );

    const idList = children.map((item) => String(item._id));

    const IdChildren = (await Promise.all(idList.map(find))).flat();

    return [...idList, ...IdChildren];
  };

  const allChildrenIdList = await find(collection._id);

  await MongoDatasetCollection.updateMany(
    {
      _id: { $in: allChildrenIdList }
    },
    {
      $set: {
        forbid
      }
    },
    {
      session
    }
  );
};

async function handler(req: ApiRequestProps) {
  const {
    datasetId,
    externalFileId,
    id: parsedCollectionId,
    parentId,
    name,
    tags,
    forbid,
    createTime
  } = parseApiInput({ req, bodySchema: UpdateDatasetCollectionBodySchema }).body;
  let id = parsedCollectionId;

  // 通过 externalFileId 查找 collection：这里只做定位，更新门槛由后续 collection manage 承担
  if (datasetId && externalFileId) {
    await authDataset({
      req,
      authToken: true,
      authApiKey: true,
      datasetId,
      per: ReadPermissionVal
    });

    const collection = await MongoDatasetCollection.findOne({ datasetId, externalFileId }, '_id');
    if (!collection) {
      return Promise.reject(CommonErrEnum.fileNotFound);
    }
    id = String(collection._id);
  }

  if (!id) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const isMove = parentId !== undefined;
  const targetParentId = parentId || null;
  // move 只校验源父级/目标父级；字段更新要求节点自身 manage。
  const hasMetaUpdate =
    !!name || tags !== undefined || forbid !== undefined || createTime !== undefined;
  const auth = { req, authToken: true, authApiKey: true, collectionId: id };
  const { collection, tmbId } = isMove
    ? await authDatasetCollectionMove({ ...auth, targetParentId })
    : await authDatasetCollection({ ...auth, per: ManagePermissionVal });
  const resourceTeamId = String(collection.teamId);

  // 同请求携带字段更新时仍需节点 manage，避免借 move 绕过改名/禁用等门槛
  if (isMove && hasMetaUpdate) {
    await authDatasetCollection({ ...auth, per: ManagePermissionVal });
  }

  // Move collection：parentId 显式提供时在事务前校验深度/环
  if (isMove) {
    await checkMoveFolderDepth({
      resourceId: id,
      targetParentId,
      findResource: (id) =>
        MongoDatasetCollection.findOne(
          { _id: id, teamId: collection.teamId, datasetId: collection.datasetId },
          '_id parentId type'
        ).lean(),
      findChildren: (parentId) =>
        MongoDatasetCollection.find(
          { parentId, teamId: collection.teamId, datasetId: collection.datasetId },
          '_id type'
        ).lean(),
      isFolderType: (type) => type === DatasetCollectionTypeEnum.folder
    });
  }

  const {
    previousCollection,
    auditChanges,
    tagChanges
  }: {
    previousCollection: DatasetCollectionSchemaType;
    auditChanges: ReturnType<typeof buildCollectionUpdateAuditChanges>;
    tagChanges: ReturnType<typeof diffCollectionTags>;
  } = await mongoSessionRun(async (session) => {
    // 所有变更共用事务内旧快照；重试时重新读取，避免并发操作导致漏记或沿用已回滚的差异。
    const previousCollection = await MongoDatasetCollection.findOne(
      { _id: id, teamId: resourceTeamId },
      null,
      { session }
    ).lean();
    if (!previousCollection) {
      return Promise.reject(CommonErrEnum.fileNotFound);
    }

    const oldParentId = previousCollection.parentId ? String(previousCollection.parentId) : null;
    const actualMove = isMove && oldParentId !== targetParentId;

    /** 路径与属性共用事务快照，在移动写入前保存，避免新位置覆盖旧位置。 */
    const getCollectionPath = async (pathParentId: string | null, pathName: string) => {
      const location = await getCollectionAuditLocation({
        datasetName: collection.dataset?.name ?? '',
        teamId: String(previousCollection.teamId),
        datasetId: String(previousCollection.datasetId),
        parentId: pathParentId,
        session
      });
      return [location, pathName].filter(Boolean).join('/');
    };
    const move = actualMove
      ? {
          oldPath: await getCollectionPath(oldParentId, previousCollection.name),
          newPath: await getCollectionPath(targetParentId, name || previousCollection.name)
        }
      : undefined;
    const auditChanges = buildCollectionUpdateAuditChanges({
      collection: previousCollection,
      update: { name, forbid },
      move
    });

    const collectionTags = await createOrGetCollectionTags({
      tags,
      teamId: resourceTeamId,
      datasetId: collection.datasetId,
      session
    });

    if (isMove) {
      // Move：不接收 inheritPermission 参数，保持 Collection 自身的继承关系不变——
      // 原为继承态则继承新父级 clbs 并同步继承态子 Folder 快照；原为独立态则保持独立配置，仅更新 parentId。
      // parentId 由 moveCollectionPermission 更新，避免重复写入。
      await moveCollectionPermission({
        collection: {
          _id: String(previousCollection._id),
          type: previousCollection.type,
          teamId: String(previousCollection.teamId),
          parentId: oldParentId,
          datasetId: String(previousCollection.datasetId),
          tmbId: String(previousCollection.tmbId),
          inheritPermission: previousCollection.inheritPermission
        },
        targetParentId,
        session
      });
    }

    await MongoDatasetCollection.updateOne(
      {
        _id: id
      },
      {
        $set: {
          ...(name && { name, updateTime: getCollectionUpdateTime({ name }) }),
          ...(collectionTags !== undefined && { tags: collectionTags }),
          ...(forbid !== undefined && { forbid }),
          ...(createTime !== undefined && { createTime })
        }
      },
      {
        session
      }
    );

    // Folder update forbid
    if (previousCollection.type === DatasetCollectionTypeEnum.folder && forbid !== undefined) {
      await updateFolderChildrenForbid({
        collection: previousCollection,
        forbid,
        session
      });
    }

    // 只使用最终成功提交的事务返回值，日志在事务外写入，避免重试重复记录。
    return {
      previousCollection,
      auditChanges,
      tagChanges: diffCollectionTags({
        currentTags: previousCollection.tags ?? [],
        nextTags: collectionTags ?? previousCollection.tags ?? []
      })
    };
  });

  const tagAuditChanges = [
    { event: DatasetAuditEventEnum.DATASET_COLLECTION_TAG_ADD, tagIds: tagChanges.addedTagIds },
    { event: DatasetAuditEventEnum.DATASET_COLLECTION_TAG_REMOVE, tagIds: tagChanges.removedTagIds }
  ].filter(({ tagIds }) => tagIds.length > 0);

  if (auditChanges.length === 0 && tagAuditChanges.length === 0) return;

  const auditLogs: AuditLogInput[] = auditChanges.map((change) => ({
    tmbId,
    teamId: resourceTeamId,
    event: DatasetAuditEventEnum.DATASET_COLLECTION_UPDATE,
    params: {
      datasetName: collection.dataset?.name ?? '',
      collectionName: previousCollection.name,
      objectType: getCollectionAuditObjectType(previousCollection.type),
      ...change
    }
  }));

  if (tagAuditChanges.length > 0) {
    // 标签名只用于展示；查询失败时回退 ID，避免已提交的集合更新因审计补充查询而失败。
    const tagDocs = await MongoDatasetCollectionTagsV2.find(
      {
        _id: { $in: [...tagChanges.addedTagIds, ...tagChanges.removedTagIds] },
        teamId: resourceTeamId,
        datasetId: collection.datasetId
      },
      'tag'
    )
      .lean()
      .catch(() => []);
    const tagNameById = new Map(tagDocs.map((tag) => [String(tag._id), tag.tag]));

    auditLogs.push(
      ...tagAuditChanges.map(({ event, tagIds }) => ({
        tmbId,
        teamId: resourceTeamId,
        event,
        params: {
          datasetName: collection.dataset?.name ?? '',
          collectionName: previousCollection.name,
          tagName: tagIds.map((tagId) => tagNameById.get(tagId) ?? tagId).join(', ')
        }
      }))
    );
  }

  // 每个属性变更一条日志，标签按集合分别记录实际新增和移除的部分。
  void addAuditLogs(auditLogs);
}

export default NextAPI(handler);
