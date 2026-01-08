import { type AuthModeType, type AuthResponseType } from '../type';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { OwnerPermissionVal, ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import { Permission } from '@fastgpt/global/support/permission/controller';
import type { FileTokenQuery } from '@fastgpt/global/common/file/type';
import { addMinutes } from 'date-fns';
import { parseHeaderCert } from './common';
import jwt from 'jsonwebtoken';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { getS3DatasetSource } from '../../../common/s3/sources/dataset';
import { isS3ObjectKey } from '../../../common/s3/utils';

export const authCollectionFile = async ({
  fileId,
  per = OwnerPermissionVal,
  ...props
}: AuthModeType & {
  fileId: string;
}): Promise<AuthResponseType> => {
  const authRes = await parseHeaderCert(props);

  if (isS3ObjectKey(fileId, 'dataset')) {
    const exists = await getS3DatasetSource().isObjectExists(fileId);
    if (!exists) return Promise.reject(CommonErrEnum.fileNotFound);
  } else {
    return Promise.reject('Invalid dataset file key');
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
