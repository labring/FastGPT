import { type AuthModeType, type AuthResponseType } from '../type';
import { type DatasetFileSchema } from '@fastgpt/global/core/dataset/type';
import { getFileById } from '../../../common/file/gridfs/controller';
import { BucketNameEnum, bucketNameMap } from '@fastgpt/global/common/file/constants';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { OwnerPermissionVal, ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import { Permission } from '@fastgpt/global/support/permission/controller';
import type { FileTokenQuery } from '@fastgpt/global/common/file/type';
import { addMinutes } from 'date-fns';
import { parseHeaderCert } from './common';
import jwt from 'jsonwebtoken';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { S3Sources } from '../../../common/s3/type';
import { getS3DatasetSource, S3DatasetSource } from '../../../common/s3/sources/dataset';
import { isS3ObjectKey } from '../../../common/s3/utils';

export const authCollectionFile = async ({
  fileId,
  per = OwnerPermissionVal,
  ...props
}: AuthModeType & {
  fileId: string;
}): Promise<AuthResponseType> => {
  const authRes = await parseHeaderCert(props);
  const { teamId, tmbId } = authRes;

  if (isS3ObjectKey(fileId, 'dataset')) {
    const stat = await getS3DatasetSource().getDatasetFileStat(fileId);
    if (!stat) return Promise.reject(CommonErrEnum.fileNotFound);
  } else {
    const file = await getFileById({ bucketName: BucketNameEnum.dataset, fileId });
    if (!file) {
      return Promise.reject(CommonErrEnum.fileNotFound);
    }
    if (file.metadata?.teamId !== teamId) {
      return Promise.reject(CommonErrEnum.unAuthFile);
    }
  }

  const permission = new Permission({ role: ReadRoleVal, isOwner: true });

  if (!permission.checkPer(per)) {
    return Promise.reject(CommonErrEnum.unAuthFile);
  }

  return {
    ...authRes,
    permission
  };
};

/* file permission */
export const createFileToken = (data: FileTokenQuery) => {
  if (!process.env.FILE_TOKEN_KEY) {
    return Promise.reject('System unset FILE_TOKEN_KEY');
  }

  const expireMinutes =
    data.customExpireMinutes ?? bucketNameMap[data.bucketName].previewExpireMinutes;
  const expiredTime = Math.floor(addMinutes(new Date(), expireMinutes).getTime() / 1000);

  const key = (process.env.FILE_TOKEN_KEY as string) ?? 'filetoken';
  const token = jwt.sign(
    {
      ...data,
      exp: expiredTime
    },
    key
  );
  return Promise.resolve(token);
};

export const authFileToken = (token?: string) =>
  new Promise<FileTokenQuery>((resolve, reject) => {
    if (!token) {
      return reject(ERROR_ENUM.unAuthFile);
    }
    const key = (process.env.FILE_TOKEN_KEY as string) ?? 'filetoken';

    jwt.verify(token, key, (err, decoded: any) => {
      if (err || !decoded.bucketName || !decoded?.teamId || !decoded?.fileId) {
        reject(ERROR_ENUM.unAuthFile);
        return;
      }
      resolve({
        bucketName: decoded.bucketName,
        teamId: decoded.teamId,
        uid: decoded.uid,
        fileId: decoded.fileId
      });
    });
  });
