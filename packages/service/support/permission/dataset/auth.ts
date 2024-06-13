import { PermissionValueType } from '@fastgpt/global/support/permission/type';
import { getResourcePermission, parseHeaderCert } from '../controller';
import { AuthPropsType, AuthResponseType } from '../type/auth';
import {
  CollectionWithDatasetType,
  DatasetFileSchema,
  DatasetSchemaType
} from '@fastgpt/global/core/dataset/type';
import { getTmbInfoByTmbId } from 'support/user/team/controller';
import { MongoDataset } from 'core/dataset/schema';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';
import { getCollectionWithDataset } from 'core/dataset/controller';
import { MongoDatasetCollection } from 'core/dataset/collection/schema';
import { getFileById } from 'common/file/gridfs/controller';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

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

    const isOwner = tmbPer.isOwner || String(dataset.tmbId) === tmbId;
    const Per = new DatasetPermission({
      per: rp?.permission ?? dataset.defaultPermission,
      isOwner
    });

    if (!Per.checkPer(per)) {
      return Promise.reject(DatasetErrEnum.unAuthDataset);
    }

    return {
      ...dataset,
      permission: Per
    };
  })();

  return { dataset: dataset };
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
    // teamId,
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

  await authDatasetByTmbId({
    tmbId,
    datasetId: collection.datasetId._id,
    per
  });

  return {
    teamId,
    tmbId,
    collection,
    permission: collection.datasetId.permission
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
