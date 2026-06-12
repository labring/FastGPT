import { type AuthModeType, type AuthResponseType } from '../type';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { FileTokenQuery } from '@fastgpt/global/common/file/type';
import jwt from 'jsonwebtoken';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { getS3DatasetSource } from '../../../common/s3/sources/dataset';
import { parseDatasetFileS3Key } from '../../../common/s3/sources/dataset/key';
import { serviceEnv } from '../../../env';
import { authDataset } from '../dataset/auth';

/**
 * 校验来自请求的 dataset S3 object key 是否属于调用者有权限访问的数据集。
 *
 * 该函数会从 `dataset/<datasetId>/...` 中解析 datasetId，并复用数据集权限体系完成
 * team/成员/协作者校验。S3 对象存在性只能作为最后的文件存在检查，不能作为权限依据。
 */
export const authDatasetFileKey = async ({
  fileId,
  per = OwnerPermissionVal,
  ...props
}: AuthModeType & {
  fileId: string;
}): Promise<AuthResponseType> => {
  const parsedKey = parseDatasetFileS3Key(fileId);
  if (!parsedKey) {
    return Promise.reject('Invalid dataset file key');
  }

  // 先按 key 内的 datasetId 做权限校验，再检查对象是否存在，避免用存在性绕过团队边界。
  const authRes = await authDataset({
    ...props,
    datasetId: parsedKey.datasetId,
    per
  });

  const exists = await getS3DatasetSource().isObjectExists(fileId);
  if (!exists) {
    return Promise.reject(CommonErrEnum.fileNotFound);
  }

  if (!authRes.permission.checkPer(per)) {
    return Promise.reject(CommonErrEnum.unAuthFile);
  }

  return {
    ...authRes,
    permission: authRes.permission
  };
};

export const authCollectionFile = authDatasetFileKey;

export const authFileToken = (token?: string) =>
  new Promise<FileTokenQuery>((resolve, reject) => {
    if (!token) {
      return reject(ERROR_ENUM.unAuthFile);
    }
    jwt.verify(token, serviceEnv.FILE_TOKEN_KEY, (err, decoded: any) => {
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
