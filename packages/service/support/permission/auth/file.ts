import { AuthModeType, AuthResponseType } from '../type';
import { DatasetFileSchema } from '@fastgpt/global/core/dataset/type';
import { parseHeaderCert } from '../controller';
import { getFileById } from '../../../common/file/gridfs/controller';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { OwnerPermissionVal, ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { Permission } from '@fastgpt/global/support/permission/controller';

export async function authFile({
  fileId,
  per = OwnerPermissionVal,
  ...props
}: AuthModeType & {
  fileId: string;
}): Promise<
  AuthResponseType & {
    file: DatasetFileSchema;
  }
> {
  const authRes = await parseHeaderCert(props);
  const { teamId, tmbId } = authRes;

  const file = await getFileById({ bucketName: BucketNameEnum.dataset, fileId });

  if (!file) {
    return Promise.reject(CommonErrEnum.fileNotFound);
  }

  if (file.metadata?.teamId !== teamId) {
    return Promise.reject(CommonErrEnum.unAuthFile);
  }

  const permission = new Permission({
    per: ReadPermissionVal,
    isOwner: file.metadata?.tmbId === tmbId
  });

  if (!permission.checkPer(per)) {
    return Promise.reject(CommonErrEnum.unAuthFile);
  }

  return {
    ...authRes,
    permission,
    file
  };
}
