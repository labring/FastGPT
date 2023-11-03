import { AuthModeType } from '../type';
import { parseHeaderAuth } from '../controller';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { MongoDataset } from '../../../core/dataset/schema';
import { getCollectionWithDataset } from '../../../core/dataset/controller';
import { PermissionTypeEnum } from '@fastgpt/global/support/permission/constant';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import { AuthResponseType } from '@fastgpt/global/support/permission/type';
import {
  CollectionWithDatasetType,
  DatasetFileSchema,
  DatasetSchemaType
} from '@fastgpt/global/core/dataset/type';
import { getFileById } from '../../../common/file/gridfs/controller';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';

export async function authDataset({
  req,
  authToken,
  datasetId,
  per = 'owner'
}: AuthModeType & {
  datasetId: string;
}): Promise<
  AuthResponseType & {
    dataset: DatasetSchemaType;
  }
> {
  const { userId, teamId, tmbId } = await parseHeaderAuth({
    req,
    authToken
  });

  const { dataset, isOwner, canWrite } = await (async () => {
    const dataset = (await MongoDataset.findById(datasetId))?.toJSON();

    if (!dataset || String(dataset?.teamId) !== teamId) {
      return Promise.reject(DatasetErrEnum.unAuthDataset);
    }

    const isOwner = String(dataset.tmbId) === tmbId;
    const canWrite = isOwner;

    if (per === 'r') {
      if (!isOwner && dataset.permission !== PermissionTypeEnum.public) {
        return Promise.reject(DatasetErrEnum.unAuthDataset);
      }
    }
    if (per === 'w' && !canWrite) {
      return Promise.reject(DatasetErrEnum.unAuthDataset);
    }
    if (per === 'owner' && !isOwner) {
      return Promise.reject(DatasetErrEnum.unAuthDataset);
    }

    return { dataset, isOwner, canWrite };
  })();

  return {
    userId,
    teamId,
    tmbId,
    dataset,
    isOwner,
    canWrite
  };
}

/* 
   Read: in team and dataset permission is public
   Write: in team, not visitor and dataset permission is public
*/
export async function authDatasetCollection({
  req,
  authToken,
  collectionId,
  role,
  per = 'owner'
}: AuthModeType & {
  collectionId: string;
  role: `${TeamMemberRoleEnum}`;
}): Promise<
  AuthResponseType & {
    collection: CollectionWithDatasetType;
  }
> {
  const { userId, teamId, tmbId } = await parseHeaderAuth({
    req,
    authToken
  });

  const { collection, isOwner, canWrite } = await (async () => {
    const collection = await getCollectionWithDataset(collectionId);

    if (!collection || String(collection.teamId) !== teamId) {
      return Promise.reject(DatasetErrEnum.unAuthDatasetCollection);
    }

    const isOwner = String(collection.datasetId.tmbId) === tmbId;
    const canWrite =
      isOwner ||
      (role !== TeamMemberRoleEnum.visitor &&
        collection.datasetId.permission === PermissionTypeEnum.public);

    if (per === 'r') {
      if (!isOwner && collection.datasetId.permission !== PermissionTypeEnum.public) {
        return Promise.reject(DatasetErrEnum.unAuthDatasetCollection);
      }
    }
    if (per === 'w' && !canWrite) {
      return Promise.reject(DatasetErrEnum.unAuthDatasetCollection);
    }
    if (per === 'owner' && !isOwner) {
      return Promise.reject(DatasetErrEnum.unAuthDatasetCollection);
    }

    return {
      collection,
      isOwner,
      canWrite
    };
  })();

  return {
    userId,
    teamId,
    tmbId,
    collection,
    isOwner,
    canWrite
  };
}

export async function authDatasetFile({
  req,
  authToken,
  fileId,
  role,
  per = 'owner'
}: AuthModeType & {
  fileId: string;
  role: `${TeamMemberRoleEnum}`;
}): Promise<
  AuthResponseType & {
    file: DatasetFileSchema;
  }
> {
  const { userId, teamId, tmbId } = await parseHeaderAuth({
    req,
    authToken
  });

  const file = await getFileById({ bucketName: BucketNameEnum.dataset, fileId });

  if (file.metadata.teamId !== teamId) {
    return Promise.reject(DatasetErrEnum.unAuthDatasetFile);
  }

  const { dataset } = await authDataset({
    req,
    authToken,
    datasetId: file.metadata.datasetId,
    per
  });
  const isOwner = String(dataset.tmbId) === tmbId;

  const canWrite =
    isOwner ||
    (role !== TeamMemberRoleEnum.visitor && dataset.permission === PermissionTypeEnum.public);

  if (per === 'r') {
    if (!isOwner && dataset.permission !== PermissionTypeEnum.public) {
      return Promise.reject(DatasetErrEnum.unAuthDatasetFile);
    }
  }
  if (per === 'w' && !canWrite) {
    return Promise.reject(DatasetErrEnum.unAuthDatasetFile);
  }
  if (per === 'owner' && !isOwner) {
    return Promise.reject(DatasetErrEnum.unAuthDatasetFile);
  }

  return {
    userId,
    teamId,
    tmbId,
    file,
    isOwner,
    canWrite
  };
}
