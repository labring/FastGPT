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
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { type ApiRequestProps } from '@fastgpt/next/type';
import {
  DatasetAuditEventEnum,
  DatasetCollectionTypeEnum,
  DatasetContentAuditActionEnum,
  type DatasetContentAuditAction
} from '@fastgpt/global/core/dataset/constants';
import { type ClientSession } from '@fastgpt/service/common/mongo';
import { type CollectionWithDatasetType } from '@fastgpt/global/core/dataset/type';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { addAuditLogs } from '@fastgpt/service/support/user/audit/util';
import { UpdateDatasetCollectionBodySchema } from '@fastgpt/global/openapi/core/dataset/collection/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { checkMoveFolderDepth } from '@fastgpt/service/common/parentFolder/depth';
import { moveCollectionPermission } from '@fastgpt/service/support/permission/collection/controller';
import { authDatasetCollectionMove } from '@fastgpt/service/support/permission/collection/moveAuth';
import {
  getCollectionAuditLocation,
  getCollectionAuditObjectType
} from '@fastgpt/service/core/dataset/collection/audit';

// Set folder collection children forbid status
const updateFolderChildrenForbid = async ({
  collection,
  forbid,
  session
}: {
  collection: CollectionWithDatasetType;
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

  // 通过 externalFileId 查找 collection：先鉴权 dataset，再查询
  if (datasetId && externalFileId) {
    await authDataset({
      req,
      authToken: true,
      authApiKey: true,
      datasetId,
      per: WritePermissionVal
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
  // Move 需要先读取 Collection 定位源父级；普通字段更新直接要求 Collection write。
  const auth = { req, authToken: true, authApiKey: true, collectionId: id };
  const { collection, teamId, tmbId } = isMove
    ? await authDatasetCollectionMove({ ...auth, targetParentId })
    : await authDatasetCollection({ ...auth, per: WritePermissionVal });

  /** 单次更新的可审计变更；一次请求可能同时改名 + 移动 + 启停。 */
  type CollectionAuditChange = {
    action: DatasetContentAuditAction;
    changeItem: string;
    oldValue: string;
    newValue: string;
  };

  const normalizeParentId = (value: unknown) => (value ? String(value) : null);
  const oldParentId = normalizeParentId(collection.parentId);
  const newParentId = normalizeParentId(parentId);
  // 只有真正发生变化的字段才落审计，避免前端回传原值也产生日志
  const actualMove = isMove && oldParentId !== newParentId;
  const actualRename = Boolean(name) && name !== collection.name;
  const actualForbidChange = forbid !== undefined && Boolean(forbid) !== Boolean(collection.forbid);
  const auditChanges: CollectionAuditChange[] = [];

  /** 拼接审计展示用的完整路径（知识库/父目录/集合名），取路径失败时退回集合名。 */
  const getCollectionPath = async ({
    parentId: pathParentId,
    name: pathName
  }: {
    parentId: string | null;
    name: string;
  }) => {
    const location = await getCollectionAuditLocation({
      datasetName: collection.dataset?.name ?? '',
      parentId: pathParentId
    });
    return [location, pathName].filter(Boolean).join('/');
  };

  if (actualRename) {
    auditChanges.push({
      action: DatasetContentAuditActionEnum.RENAME,
      changeItem: i18nT('account_team:dataset_content_change_item_name'),
      oldValue: collection.name,
      newValue: name!
    });
  }

  if (actualForbidChange) {
    auditChanges.push({
      action: forbid ? DatasetContentAuditActionEnum.DISABLE : DatasetContentAuditActionEnum.ENABLE,
      changeItem: i18nT('account_team:dataset_content_change_item_status'),
      oldValue: collection.forbid
        ? i18nT('account_team:dataset_content_status_disabled')
        : i18nT('account_team:dataset_content_status_enabled'),
      newValue: forbid
        ? i18nT('account_team:dataset_content_status_disabled')
        : i18nT('account_team:dataset_content_status_enabled')
    });
  }

  // 移动需要在事务前先取旧路径，事务提交后 collection 已指向新父级
  const oldCollectionPath = actualMove
    ? await getCollectionPath({ parentId: oldParentId, name: collection.name })
    : undefined;

  // Move collection：parentId 显式提供时在事务前校验深度/环
  if (isMove) {
    await checkMoveFolderDepth({
      resourceId: id,
      targetParentId,
      teamId: collection.teamId,
      model: MongoDatasetCollection,
      isFolderType: (type) => type === DatasetCollectionTypeEnum.folder
    });
  }

  await mongoSessionRun(async (session) => {
    const collectionTags = await createOrGetCollectionTags({
      tags,
      teamId,
      datasetId: collection.datasetId,
      session
    });

    if (isMove) {
      // Move：不接收 inheritPermission 参数，保持 Collection 自身的继承关系不变——
      // 原为继承态则继承新父级 clbs 并同步继承态子 Folder 快照；原为独立态则保持独立配置，仅更新 parentId。
      // parentId 由 moveCollectionPermission 更新，避免重复写入。
      await moveCollectionPermission({
        collection: {
          _id: String(collection._id),
          type: collection.type,
          teamId: String(collection.teamId),
          parentId: collection.parentId ? String(collection.parentId) : null,
          datasetId: String(collection.datasetId),
          tmbId: String(collection.tmbId),
          inheritPermission: collection.inheritPermission
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
    if (collection.type === DatasetCollectionTypeEnum.folder && forbid !== undefined) {
      await updateFolderChildrenForbid({
        collection,
        forbid,
        session
      });
    }
  });

  if (actualMove) {
    const newCollectionPath = await getCollectionPath({
      parentId: newParentId,
      name: actualRename ? name! : collection.name
    });
    auditChanges.push({
      action: DatasetContentAuditActionEnum.MOVE,
      changeItem: i18nT('account_team:dataset_content_change_item_location'),
      oldValue: oldCollectionPath ?? collection.name,
      newValue: newCollectionPath
    });
  }

  if (auditChanges.length === 0) return;

  // 每个变更对象一条日志，保留审计列表的逐项追溯粒度
  void addAuditLogs(
    auditChanges.map((change) => ({
      tmbId,
      teamId,
      event: DatasetAuditEventEnum.DATASET_COLLECTION_UPDATE,
      params: {
        datasetName: collection.dataset?.name ?? '',
        collectionName: collection.name,
        objectType: getCollectionAuditObjectType(collection.type),
        ...change
      }
    }))
  );
}

export default NextAPI(handler);
