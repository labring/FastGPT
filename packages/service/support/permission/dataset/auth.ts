import { type PermissionValueType } from '@fastgpt/global/support/permission/type';
import { getResourcePermission, parseHeaderCert } from '../controller';
import {
  type CollectionWithDatasetType,
  type DatasetDataItemType,
  type DatasetSchemaType
} from '@fastgpt/global/core/dataset/type';
import { getTmbInfoByTmbId } from '../../user/team/controller';
import { MongoDataset } from '../../../core/dataset/schema';
import { NullPermission, PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';
import { getCollectionWithDataset } from '../../../core/dataset/controller';
import { MongoDatasetData } from '../../../core/dataset/data/schema';
import { type AuthModeType, type AuthResponseType } from '../type';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { type ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { DatasetDefaultPermissionVal } from '@fastgpt/global/support/permission/dataset/constant';
import { getDatasetImagePreviewUrl } from '../../../core/dataset/image/utils';

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

    // get dataset permission or inherit permission from parent folder.
    const { Per } = await (async () => {
      if (isOwner) {
        return {
          Per: new DatasetPermission({ isOwner: true })
        };
      }
      if (
        dataset.type === DatasetTypeEnum.folder ||
        dataset.inheritPermission === false ||
        !dataset.parentId
      ) {
        // 1. is a folder. (Folders have compeletely permission)
        // 2. inheritPermission is false.
        // 3. is root folder/dataset.
        const rp = await getResourcePermission({
          teamId,
          tmbId,
          resourceId: datasetId,
          resourceType: PerResourceTypeEnum.dataset
        });
        const Per = new DatasetPermission({
          per: rp ?? DatasetDefaultPermissionVal,
          isOwner
        });
        return {
          Per
        };
      } else {
        // is not folder and inheritPermission is true and is not root folder.
        const { dataset: parent } = await authDatasetByTmbId({
          tmbId,
          datasetId: dataset.parentId,
          per,
          isRoot
        });

        const Per = new DatasetPermission({
          per: parent.permission.value,
          isOwner
        });

        return {
          Per
        };
      }
    })();

    if (!Per.checkPer(per)) {
      return Promise.reject(DatasetErrEnum.unAuthDataset);
    }

    return {
      ...dataset,
      permission: Per
    };
  })();

  return { dataset };
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
  per = NullPermission,
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

  const { dataset } = await authDatasetByTmbId({
    tmbId,
    datasetId: collection.datasetId,
    per,
    isRoot: isRootFromHeader
  });

  return {
    userId,
    teamId,
    tmbId,
    collection,
    permission: dataset.permission,
    isRoot: isRootFromHeader
  };
}

// export async function authDatasetFile({
//   fileId,
//   per,
//   ...props
// }: AuthModeType & {
//   fileId: string;
// }): Promise<
//   AuthResponseType<DatasetPermission> & {
//     file: DatasetFileSchema;
//   }
// > {
//   const { teamId, tmbId, isRoot } = await parseHeaderCert(props);

//   const [file, collection] = await Promise.all([
//     getFileById({ bucketName: BucketNameEnum.dataset, fileId }),
//     MongoDatasetCollection.findOne({
//       teamId,
//       fileId
//     })
//   ]);

//   if (!file) {
//     return Promise.reject(CommonErrEnum.fileNotFound);
//   }

//   if (!collection) {
//     return Promise.reject(DatasetErrEnum.unAuthDatasetFile);
//   }

//   try {
//     const { permission } = await authDatasetCollection({
//       ...props,
//       collectionId: collection._id,
//       per,
//       isRoot
//     });

//     return {
//       teamId,
//       tmbId,
//       file,
//       permission,
//       isRoot
//     };
//   } catch (error) {
//     return Promise.reject(DatasetErrEnum.unAuthDatasetFile);
//   }
// }

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
    return Promise.reject('core.dataset.error.Data not found');
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
    imagePreivewUrl: datasetData.imageId
      ? getDatasetImagePreviewUrl({
          imageId: datasetData.imageId,
          teamId: datasetData.teamId,
          datasetId: datasetData.datasetId,
          expiredMinutes: 30
        })
      : undefined,
    chunkIndex: datasetData.chunkIndex,
    indexes: datasetData.indexes,
    datasetId: String(datasetData.datasetId),
    collectionId: String(datasetData.collectionId),
    sourceName: result.collection.name || '',
    sourceId: result.collection?.fileId || result.collection?.rawLink,
    isOwner: String(datasetData.tmbId) === String(result.tmbId)
    // permission: result.permission
  };

  return {
    ...result,
    datasetData: data,
    collection: result.collection
  };
}
