import { parseHeaderCert } from '../controller';
import { OwnerPermissionVal, ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import type { EvalDatasetCollectionSchemaType } from '@fastgpt/global/core/evaluation/dataset/type';
import type { AuthModeType, AuthResponseType } from '../type';
import { MongoEvalDatasetCollection } from '../../../core/evaluation/dataset/evalDatasetCollectionSchema';
import { getTmbInfoByTmbId } from '../../user/team/controller';
import type { PermissionValueType } from '@fastgpt/global/support/permission/type';
import { getFileById } from '../../../common/file/gridfs/controller';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { Permission } from '@fastgpt/global/support/permission/controller';
import type { DatasetFileSchema } from '@fastgpt/global/core/dataset/type';

export const authEvalDatasetCollectionByTmbId = async ({
  tmbId,
  collectionId,
  per,
  isRoot = false
}: {
  tmbId: string;
  collectionId: string;
  per: PermissionValueType;
  isRoot?: boolean;
}): Promise<{
  collection: EvalDatasetCollectionSchemaType;
}> => {
  const [{ teamId, permission: tmbPer }, collection] = await Promise.all([
    getTmbInfoByTmbId({ tmbId }),
    MongoEvalDatasetCollection.findOne({ _id: collectionId }).lean()
  ]);
  // TODO: error code
  if (!collection) {
    return Promise.reject('Evaluation dataset collection not found');
  }

  if (String(collection.teamId) !== teamId) {
    return Promise.reject('Unauthorized access to evaluation dataset collection');
  }

  // Check if user is owner or has permission
  const isOwner = tmbPer.isOwner || String(collection.tmbId) === String(tmbId);

  if (!isRoot && !isOwner) {
    return Promise.reject('Unauthorized access to evaluation dataset collection');
  }

  return { collection };
};

export const authEvalDatasetCollection = async ({
  collectionId,
  per,
  ...props
}: AuthModeType & {
  collectionId: string;
  per: PermissionValueType;
}): Promise<{
  userId: string;
  teamId: string;
  tmbId: string;
  collection: EvalDatasetCollectionSchemaType;
  isRoot: boolean;
}> => {
  const result = await parseHeaderCert(props);
  const { tmbId } = result;

  if (!collectionId) {
    return Promise.reject('Collection ID is required');
  }

  const { collection } = await authEvalDatasetCollectionByTmbId({
    tmbId,
    collectionId,
    per,
    isRoot: result.isRoot
  });

  return {
    userId: result.userId,
    teamId: result.teamId,
    tmbId: result.tmbId,
    collection,
    isRoot: result.isRoot
  };
};

export const authEvalDatasetCollectionFile = async ({
  fileId,
  per = OwnerPermissionVal,
  ...props
}: AuthModeType & {
  fileId: string;
}): Promise<
  AuthResponseType & {
    file: DatasetFileSchema;
  }
> => {
  const authRes = await parseHeaderCert(props);
  const { teamId, tmbId } = authRes;

  const file = await getFileById({ bucketName: BucketNameEnum.evaluation, fileId });

  if (!file) {
    return Promise.reject(CommonErrEnum.fileNotFound);
  }

  if (file.metadata?.teamId !== teamId) {
    return Promise.reject(CommonErrEnum.unAuthFile);
  }

  const permission = new Permission({
    role: ReadRoleVal,
    isOwner: file.metadata?.uid === tmbId || file.metadata?.tmbId === tmbId
  });

  if (!permission.checkPer(per)) {
    return Promise.reject(CommonErrEnum.unAuthFile);
  }

  return {
    ...authRes,
    permission,
    file
  };
};
