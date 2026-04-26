import { type PermissionValueType } from '@fastgpt/global/support/permission/type';
import { getTmbPermission } from '../controller';
import {
  type CollectionWithDatasetType,
  type DatasetCollectionSchemaType,
  type DatasetDataItemType,
  type DatasetSchemaType
} from '@fastgpt/global/core/dataset/type';
import { getTmbInfoByTmbId } from '../../user/team/controller';
import { MongoDataset } from '../../../core/dataset/schema';
import { MongoDatasetCollection } from '../../../core/dataset/collection/schema';
import {
  NullPermissionVal,
  NullRoleVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';
import { getCollectionWithDataset } from '../../../core/dataset/controller';
import { MongoDatasetData } from '../../../core/dataset/data/schema';
import { type AuthModeType, type AuthResponseType } from '../type';
import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { type ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { i18nT } from '../../../../global/common/i18n/utils';
import { parseHeaderCert } from '../auth/common';
import { sumPer } from '@fastgpt/global/support/permission/utils';
import { getS3DatasetSource } from '../../../common/s3/sources/dataset';
import { isS3ObjectKey } from '../../../common/s3/utils';

const MAX_COLLECTION_PERMISSION_DEPTH = 10;

export const authDatasetByTmbId = async ({
  tmbId,
  datasetId,
  per,
  isRoot = false
}: {
  tmbId: string;
  datasetId: string;
  per: PermissionValueType;
  isRoot?: boolean;
}): Promise<{
  dataset: DatasetSchemaType & {
    permission: DatasetPermission;
  };
}> => {
  const dataset = await (async () => {
    const [{ teamId, permission: tmbPer }, dataset] = await Promise.all([
      getTmbInfoByTmbId({ tmbId }),
      MongoDataset.findOne({ _id: datasetId }).lean()
    ]);

    if (!dataset) {
      return Promise.reject(DatasetErrEnum.unExist);
    }

    if (isRoot) {
      return {
        ...dataset,
        permission: new DatasetPermission({
          isOwner: true
        })
      };
    }

    if (String(dataset.teamId) !== teamId) {
      return Promise.reject(DatasetErrEnum.unAuthDataset);
    }

    const isOwner = tmbPer.isOwner || String(dataset.tmbId) === String(tmbId);
    const isGetParentClb =
      dataset.inheritPermission && dataset.type !== DatasetTypeEnum.folder && !!dataset.parentId;

    const [folderPer = NullRoleVal, myPer = NullRoleVal] = await Promise.all([
      isGetParentClb
        ? getTmbPermission({
            teamId,
            tmbId,
            resourceId: dataset.parentId!,
            resourceType: PerResourceTypeEnum.dataset
          })
        : NullRoleVal,
      getTmbPermission({
        teamId,
        tmbId,
        resourceId: datasetId,
        resourceType: PerResourceTypeEnum.dataset
      })
    ]);

    // For inherited non-folder datasets, by design they should have no direct clbs.
    // We still sum myPer for backward compatibility (old data may have residual clbs).
    const Per = new DatasetPermission({ role: sumPer(folderPer, myPer), isOwner });

    if (!Per.checkPer(per)) {
      return Promise.reject(DatasetErrEnum.unAuthDataset);
    }

    return {
      ...dataset,
      permission: Per
    };
  })();

  return { dataset: dataset as DatasetSchemaType & { permission: DatasetPermission } };
};

export const authDataset = async ({
  datasetId,
  per,
  ...props
}: AuthModeType & {
  datasetId: ParentIdType;
  per: PermissionValueType;
}): Promise<
  AuthResponseType & {
    dataset: DatasetSchemaType & {
      permission: DatasetPermission;
    };
  }
> => {
  const result = await parseHeaderCert(props);
  const { tmbId } = result;

  if (!datasetId) {
    return Promise.reject(DatasetErrEnum.unExist);
  }

  const { dataset } = await authDatasetByTmbId({
    tmbId,
    datasetId,
    per,
    isRoot: result.isRoot
  });

  return {
    ...result,
    permission: dataset.permission,
    dataset
  };
};

// the temporary solution for authDatasetCollection is getting the
export async function authDatasetCollection({
  collectionId,
  per = NullPermissionVal,
  isRoot = false,
  ...props
}: AuthModeType & {
  collectionId: string;
  isRoot?: boolean;
}): Promise<
  AuthResponseType<DatasetPermission> & {
    collection: CollectionWithDatasetType;
  }
> {
  const { teamId, tmbId, userId, isRoot: isRootFromHeader } = await parseHeaderCert(props);
  const collection = await getCollectionWithDataset(collectionId);

  if (!collection) {
    return Promise.reject(DatasetErrEnum.unExist);
  }

  const effectiveIsRoot = isRoot || isRootFromHeader;

  if (effectiveIsRoot) {
    return {
      userId,
      teamId,
      tmbId,
      collection,
      permission: new DatasetPermission({ isOwner: true }),
      isRoot: effectiveIsRoot
    };
  }

  const permission = await getCollectionTmbPermission({
    collection,
    teamId,
    tmbId
  });

  if (!permission.checkPer(per)) {
    return Promise.reject(DatasetErrEnum.unAuthDataset);
  }

  return {
    userId,
    teamId,
    tmbId,
    collection,
    permission,
    isRoot: effectiveIsRoot
  };
}

/**
 * Get the effective permission for a collection for a given team member.
 * Handles both independent permissions and inheritance from parent.
 */
export async function getCollectionTmbPermission({
  collection,
  teamId,
  tmbId,
  depth = 0
}: {
  collection: Pick<
    DatasetCollectionSchemaType,
    '_id' | 'tmbId' | 'datasetId' | 'parentId' | 'inheritPermission' | 'type'
  >;
  teamId: string;
  tmbId: string;
  depth?: number;
}): Promise<DatasetPermission> {
  // Prevent infinite recursion
  if (depth > MAX_COLLECTION_PERMISSION_DEPTH) {
    return new DatasetPermission({ role: NullRoleVal });
  }

  const { permission: tmbPer } = await getTmbInfoByTmbId({ tmbId });

  // Check if owner of this collection (team owner or collection creator)
  const isOwner = tmbPer.isOwner || String(collection.tmbId) === String(tmbId);
  if (isOwner) {
    return new DatasetPermission({ isOwner: true });
  }

  // If collection has independent permissions (inheritPermission === false) or is a folder
  // Folder collections always manage their own permissions directly
  const hasIndependentPermission =
    collection.inheritPermission === false || collection.type === DatasetCollectionTypeEnum.folder;

  if (hasIndependentPermission) {
    // Only use own permissions from resource_permissions
    const myPer = await getTmbPermission({
      teamId,
      tmbId,
      resourceId: collection._id,
      resourceType: PerResourceTypeEnum.collection
    });
    return new DatasetPermission({ role: myPer ?? NullRoleVal });
  }

  // inheritPermission = true (or undefined for backward compat): inherit from parent
  // By design, inherited non-folder resources should have NO direct clbs.
  // Their effective permission is purely from the parent chain.
  let parentRoleVal: number = NullRoleVal;

  if (collection.parentId) {
    // Parent is another collection
    const parentCollection = await MongoDatasetCollection.findOne(
      { _id: collection.parentId },
      '_id tmbId datasetId parentId inheritPermission type'
    ).lean<
      Pick<
        DatasetCollectionSchemaType,
        '_id' | 'tmbId' | 'datasetId' | 'parentId' | 'inheritPermission' | 'type'
      >
    >();

    if (parentCollection) {
      const parentPermission = await getCollectionTmbPermission({
        collection: parentCollection,
        teamId,
        tmbId,
        depth: depth + 1
      });
      parentRoleVal = parentPermission.role;
    }
  } else {
    // Parent is the dataset - get effective dataset permission (including folder inheritance and owner check)
    const { dataset: ds } = await authDatasetByTmbId({
      tmbId,
      datasetId: collection.datasetId,
      per: NullPermissionVal
    });
    parentRoleVal = ds.permission.role;
  }

  const myPer =
    (await getTmbPermission({
      teamId,
      tmbId,
      resourceId: collection._id,
      resourceType: PerResourceTypeEnum.collection
    })) ?? NullRoleVal;

  return new DatasetPermission({ role: sumPer(parentRoleVal, myPer) });
}

/*
  DatasetData permission is inherited from collection.
*/
export async function authDatasetData({
  dataId,
  ...props
}: AuthModeType & {
  dataId: string;
}) {
  // get mongo dataset.data
  const datasetData = await MongoDatasetData.findById(dataId);

  if (!datasetData) {
    return Promise.reject(i18nT('common:core.dataset.error.Data not found'));
  }

  const result = await authDatasetCollection({
    ...props,
    collectionId: datasetData.collectionId
  });

  const data: DatasetDataItemType = {
    id: String(datasetData._id),
    teamId: datasetData.teamId,
    updateTime: datasetData.updateTime,
    q: datasetData.q,
    a: datasetData.a,
    imageId: datasetData.imageId,
    imagePreivewUrl:
      datasetData.imageId && isS3ObjectKey(datasetData.imageId, 'dataset')
        ? (
            await getS3DatasetSource().createGetDatasetFileURL({
              key: datasetData.imageId,
              expiredHours: 1,
              external: true
            })
          ).url
        : undefined,
    chunkIndex: datasetData.chunkIndex,
    indexes: datasetData.indexes,
    datasetId: String(datasetData.datasetId),
    collectionId: String(datasetData.collectionId),
    sourceName: result.collection.name || '',
    sourceId: result.collection?.fileId || result.collection?.rawLink,
    isOwner: String(datasetData.tmbId) === String(result.tmbId),
    metadata: datasetData.metadata
    // permission: result.permission
  };

  return {
    ...result,
    datasetData: data,
    collection: result.collection
  };
}
