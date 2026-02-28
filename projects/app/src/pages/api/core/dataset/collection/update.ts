import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import {
  createOrGetCollectionTags,
  getCollectionUpdateTime
} from '@fastgpt/service/core/dataset/collection/utils';
import { validateCollectionNameUpdate } from '@fastgpt/service/core/dataset/collection/validateName';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { type ClientSession } from '@fastgpt/service/common/mongo';
import { type CollectionWithDatasetType } from '@fastgpt/global/core/dataset/type';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import { delCollection } from '@fastgpt/service/core/dataset/collection/controller';
import { findCollectionAndChild } from '@fastgpt/service/core/dataset/collection/utils';
export type UpdateDatasetCollectionParams = {
  id?: string;
  parentId?: string;
  name?: string;
  tags?: string[]; // Not tag id, is tag label
  forbid?: boolean;
  createTime?: Date;
  overwriteDuplicate?: boolean; // If true, delete duplicate files in the same folder; otherwise add suffix

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
  let {
    datasetId,
    externalFileId,
    id,
    parentId,
    name,
    tags,
    forbid,
    createTime,
    overwriteDuplicate
  } = req.body;

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

  // Validate collection name if name is being updated (only check extension)
  if (name && name !== collection.name) {
    await validateCollectionNameUpdate({
      collectionId: String(id),
      datasetId: collection.datasetId,
      newName: name,
      originalName: collection.name,
      collectionType: collection.type
    });
  }

  // Determine if this is a move or rename operation
  const isMoving = parentId !== undefined && String(parentId) !== String(collection.parentId);
  const isRenaming = name && name !== collection.name;

  await mongoSessionRun(async (session) => {
    let finalName = name;

    // Handle duplicate file name when renaming or moving (within transaction to avoid TOCTOU)
    if ((isRenaming || isMoving) && collection.type === DatasetCollectionTypeEnum.file) {
      // Normalize parentId: convert empty string to undefined
      const targetParentId = parentId !== undefined ? parentId : collection.parentId;
      const normalizedParentId =
        targetParentId && String(targetParentId).trim() !== '' ? String(targetParentId) : undefined;

      const checkName = name || collection.name; // Use new name if renaming, otherwise current name

      // Build query for duplicate check - only check within the same parentId folder
      const duplicateQuery: Record<string, any> = {
        datasetId: collection.datasetId,
        name: checkName,
        type: DatasetCollectionTypeEnum.file,
        _id: { $ne: id } // Exclude current collection
      };

      // Handle parentId query condition
      if (normalizedParentId) {
        duplicateQuery.parentId = normalizedParentId;
      } else {
        // Root directory: parentId is null or does not exist
        duplicateQuery.$or = [{ parentId: null }, { parentId: { $exists: false } }];
      }

      // Check if file with same name exists in the same folder (within transaction)
      const existingCollection = await MongoDatasetCollection.findOne(duplicateQuery, '_id', {
        session
      });

      if (existingCollection) {
        // Scenario 1: User is renaming the file (name parameter is provided)
        // In this case, we should NOT auto-add suffix, but reject with duplicate error
        if (isRenaming && !isMoving) {
          // Pure rename operation - reject duplicate names
          return Promise.reject(DatasetErrEnum.collectionNameDuplicate);
        }

        // Scenario 2: User is moving the file to another folder (only parentId changes)
        // OR Scenario 3: User provided overwriteDuplicate flag
        // In these cases, we can handle duplicates automatically
        if (overwriteDuplicate === true) {
          // Overwrite mode: delete old collection within the same transaction
          const deletedCollectionId = String(existingCollection._id);

          // Find all child collections
          const collections = await findCollectionAndChild({
            teamId,
            datasetId: collection.datasetId,
            collectionId: deletedCollectionId,
            fields: '_id teamId datasetId fileId metadata'
          });

          // Delete collection and related data (data and training records)
          await delCollection({
            collections,
            delImg: true,
            delFile: true,
            session
          });

          // Use the requested name
          finalName = checkName;
        } else {
          // No overwrite: add suffix to new file name (only for move operations)
          const lastDotIndex = checkName.lastIndexOf('.');
          const fileNameWithoutExt =
            lastDotIndex > 0 ? checkName.substring(0, lastDotIndex) : checkName;
          const fileExt = lastDotIndex > 0 ? checkName.substring(lastDotIndex) : '';

          // Escape special regex characters
          const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const escapedBase = escapeRegex(fileNameWithoutExt);
          const escapedExt = escapeRegex(fileExt);

          // Build query for suffix pattern - only check within the same parentId folder
          const suffixQuery: Record<string, any> = {
            datasetId: collection.datasetId,
            name: { $regex: `^${escapedBase}\\(\\d+\\)${escapedExt}$` },
            type: DatasetCollectionTypeEnum.file
          };

          // Handle parentId query condition
          if (normalizedParentId) {
            suffixQuery.parentId = normalizedParentId;
          } else {
            // Root directory: parentId is null or does not exist
            suffixQuery.$or = [{ parentId: null }, { parentId: { $exists: false } }];
          }

          // Query all existing files with suffix pattern in the same folder (within transaction)
          const existingNames = await MongoDatasetCollection.find(suffixQuery, 'name', {
            session
          }).lean();

          // Find max suffix from existing names
          let maxSuffix = 0;
          const suffixRegex = new RegExp(`^${escapedBase}\\((\\d+)\\)${escapedExt}$`);
          for (const doc of existingNames) {
            const match = doc.name.match(suffixRegex);
            if (match) {
              const num = parseInt(match[1], 10);
              if (num > maxSuffix) maxSuffix = num;
            }
          }

          finalName = `${fileNameWithoutExt}(${maxSuffix + 1})${fileExt}`;
        }
      }
    }

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
          ...(finalName && {
            name: finalName,
            updateTime: getCollectionUpdateTime({ name: finalName })
          }),
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
