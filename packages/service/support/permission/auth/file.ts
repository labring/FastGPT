import { AuthResponseType } from '@fastgpt/global/support/permission/type';
import { AuthModeType } from '../type';
import { DatasetFileSchema } from '@fastgpt/global/core/dataset/type';
import { parseHeaderCert } from '../controller';
import { getFileById } from '../../../common/file/gridfs/controller';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

export async function authFile({
  fileId,
  per = 'owner',
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
  if (per === 'owner' && file.metadata?.tmbId !== tmbId) {
    return Promise.reject(CommonErrEnum.unAuthFile);
  }

  return {
    ...authRes,
    isOwner: per === 'owner',
    canWrite: per === 'owner',
    file
  };
}
