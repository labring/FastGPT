import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import {
  PresignDatasetFileGetUrlSchema,
  type PresignDatasetFileGetUrlParams
} from '@fastgpt/global/core/dataset/v2/api';
import {
  authDataset,
  authDatasetCollection
} from '@fastgpt/service/support/permission/dataset/auth';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { createFileToken } from '@fastgpt/service/support/permission/auth/file';
import { BucketNameEnum, ReadFileBaseUrl } from '@fastgpt/global/common/file/constants';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { UserError } from '@fastgpt/global/common/error/utils';
import { getFileDatasetInfo } from '@fastgpt/service/core/dataset/utils';

async function handler(req: ApiRequestProps<PresignDatasetFileGetUrlParams>) {
  const parsed = PresignDatasetFileGetUrlSchema.parse(req.body);
  const s3DatasetSource = getS3DatasetSource();

  // 获取文档中解析出来的图片
  if ('key' in parsed) {
    const { key } = parsed;

    const dataset = await getFileDatasetInfo(key);
    if (!dataset) {
      // 如果 `dataset_datas` 中没有找到记录，则这次的请求应该是图片的预览请求，验证 datasetId 的权限即可
      const datasetId = key.split('/')[1] || '';
      await authDataset({
        datasetId,
        per: ReadPermissionVal,
        req,
        authToken: true,
        authApiKey: true
      });
    } else {
      await authDatasetCollection({
        req,
        authToken: true,
        authApiKey: true,
        per: ReadPermissionVal,
        collectionId: dataset.collectionId
      });
    }

    return await s3DatasetSource.createGetDatasetFileURL({ key, expiredHours: 24 });
  }

  // 其他文件
  const { collectionId } = parsed;
  const {
    collection,
    teamId: userTeamId,
    tmbId: uid,
    authType
  } = await authDatasetCollection({
    req,
    collectionId,
    authToken: true,
    authApiKey: true,
    per: ReadPermissionVal
  });

  if (collection.type === DatasetCollectionTypeEnum.images) {
    return Promise.reject(new UserError('chat:images_collection_not_supported'));
  }

  const key = collection.fileId;
  if (!key) {
    return Promise.reject(CommonErrEnum.unAuthFile);
  }

  if (s3DatasetSource.isDatasetObjectKey(key)) {
    return await s3DatasetSource.createGetDatasetFileURL({ key, expiredHours: 24 });
  } else {
    const token = await createFileToken({
      uid,
      fileId: key,
      teamId: userTeamId,
      bucketName: BucketNameEnum.dataset,
      customExpireMinutes: authType === 'outLink' ? 5 : undefined
    });

    return `${ReadFileBaseUrl}/${collection.name}?token=${token}`;
  }
}

export default NextAPI(handler);
