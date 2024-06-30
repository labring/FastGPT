import { PermissionValueType } from '@fastgpt/global/support/permission/type';
import { getResourcePermission, parseHeaderCert } from '../controller';
import { AuthPropsType, AuthResponseType } from '../type/auth';
import {
  CollectionWithDatasetType,
  DatasetDataItemType,
  DatasetFileSchema,
  DatasetSchemaType
} from '@fastgpt/global/core/dataset/type';
import { getTmbInfoByTmbId } from '../../user/team/controller';
import { MongoDataset } from '../../../core/dataset/schema';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';
import { getCollectionWithDataset } from '../../../core/dataset/controller';
import { MongoDatasetCollection } from '../../../core/dataset/collection/schema';
import { getFileById } from '../../../common/file/gridfs/controller';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { MongoDatasetData } from '../../../core/dataset/data/schema';
import { DatasetDefaultPermissionVal } from '@fastgpt/global/support/permission/dataset/constant';

export async function authDatasetByTmbId({
  tmbId,
  datasetId,
  per
}: {
  tmbId: string;
  datasetId: string;
  per: PermissionValueType;
}) {
  const { teamId, permission: tmbPer } = await getTmbInfoByTmbId({ tmbId });

  const dataset = await (async () => {
    // get app and per
    const [dataset, rp] = await Promise.all([
      MongoDataset.findOne({ _id: datasetId, teamId }).lean(),
      getResourcePermission({
        teamId,
        tmbId,
        resourceId: datasetId,
        resourceType: PerResourceTypeEnum.dataset
      }) // this could be null
    ]);

    if (!dataset) {
      return Promise.reject(DatasetErrEnum.unExist);
    }

    const isOwner = tmbPer.isOwner || String(dataset.tmbId) === String(tmbId);
    const Per = new DatasetPermission({
      per: rp?.permission ?? dataset.defaultPermission,
      isOwner
    });

    if (!Per.checkPer(per)) {
      return Promise.reject(DatasetErrEnum.unAuthDataset);
    }

    return {
      ...dataset,
      defaultPermission: dataset.defaultPermission ?? DatasetDefaultPermissionVal,
      permission: Per
    };
  })();

  return { dataset };
}

// Auth Dataset
export async function authDataset({
  datasetId,
  per,
  ...props
}: AuthPropsType & {
  datasetId: string;
}): Promise<
  AuthResponseType<DatasetPermission> & {
    dataset: DatasetSchemaType;
  }
> {
  const { teamId, tmbId } = await parseHeaderCert(props);

  const { dataset } = await authDatasetByTmbId({
    tmbId,
    datasetId,
    per
  });

  return {
    teamId,
    tmbId,
    dataset,
    permission: dataset.permission
  };
}

// the temporary solution for authDatasetCollection is getting the
export async function authDatasetCollection({
  collectionId,
  per,
  ...props
}: AuthPropsType & {
  collectionId: string;
}): Promise<
  AuthResponseType<DatasetPermission> & {
    collection: CollectionWithDatasetType;
  }
> {
  const { teamId, tmbId } = await parseHeaderCert(props);
  const collection = await getCollectionWithDataset(collectionId);

  if (!collection) {
    return Promise.reject(DatasetErrEnum.unExist);
  }

  const { dataset } = await authDatasetByTmbId({
    tmbId,
    datasetId: collection.datasetId._id,
    per
  });

  return {
    teamId,
    tmbId,
    collection,
    permission: dataset.permission
  };
}

export async function authDatasetFile({
  fileId,
  per,
  ...props
}: AuthPropsType & {
  fileId: string;
}): Promise<
  AuthResponseType<DatasetPermission> & {
    file: DatasetFileSchema;
  }
> {
  const { teamId, tmbId } = await parseHeaderCert(props);

  const [file, collection] = await Promise.all([
    getFileById({ bucketName: BucketNameEnum.dataset, fileId }),
    MongoDatasetCollection.findOne({
      teamId,
      fileId
    })
  ]);

  if (!file) {
    return Promise.reject(CommonErrEnum.fileNotFound);
  }

  if (!collection) {
    return Promise.reject(DatasetErrEnum.unAuthDatasetFile);
  }

  try {
    const { permission } = await authDatasetCollection({
      ...props,
      collectionId: collection._id,
      per
    });

    return {
      teamId,
      tmbId,
      file,
      permission
    };
  } catch (error) {
    return Promise.reject(DatasetErrEnum.unAuthDatasetFile);
  }
}

export async function authDatasetData({
  dataId,
  ...props
}: AuthPropsType & {
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
    q: datasetData.q,
    a: datasetData.a,
    chunkIndex: datasetData.chunkIndex,
    indexes: datasetData.indexes,
    datasetId: String(datasetData.datasetId),
    collectionId: String(datasetData.collectionId),
    sourceName: result.collection.name || '',
    sourceId: result.collection?.fileId || result.collection?.rawLink,
    isOwner: String(datasetData.tmbId) === String(result.tmbId),
    canWrite: result.permission.hasWritePer
  };

  return {
    ...result,
    datasetData: data
  };
}
