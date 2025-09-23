import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import {
  createOrGetCollectionTags,
  getCollectionUpdateTime
} from '@fastgpt/service/core/dataset/collection/utils';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { type ClientSession } from '@fastgpt/service/common/mongo';
import { type CollectionWithDatasetType } from '@fastgpt/global/core/dataset/type';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
export type UpdateDatasetCollectionParams = {
  id?: string;
  parentId?: string;
  name?: string;
  tags?: string[]; // Not tag id, is tag label
  forbid?: boolean;
  createTime?: Date;

  // External file id
  datasetId?: string;
  externalFileId?: string;
};

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

async function handler(req: ApiRequestProps<UpdateDatasetCollectionParams>) {
  let { datasetId, externalFileId, id, parentId, name, tags, forbid, createTime } = req.body;

  if (datasetId && externalFileId) {
    const collection = await MongoDatasetCollection.findOne({ datasetId, externalFileId }, '_id');
    if (!collection) {
      return Promise.reject(CommonErrEnum.fileNotFound);
    }
    id = collection._id;
  }

  if (!id) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // 凭证校验
  const { collection, teamId, tmbId } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId: id,
    per: WritePermissionVal
  });

  await mongoSessionRun(async (session) => {
    const collectionTags = await createOrGetCollectionTags({
      tags,
      teamId,
      datasetId: collection.datasetId,
      session
    });

    await MongoDatasetCollection.updateOne(
      {
        _id: id
      },
      {
        $set: {
          ...(parentId !== undefined && { parentId: parentId || null }),
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

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.UPDATE_COLLECTION,
      params: {
        collectionName: collection.name,
        datasetName: collection.dataset?.name || '',
        datasetType: getI18nDatasetType(collection.dataset?.type || '')
      }
    });
  })();
}

export default NextAPI(handler);
