import { getGlobalRedisConnection } from '@fastgpt/service/common/redis';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import {
  ShortPreviewLinkSchema,
  type ShortPreviewLinkParams
} from '@fastgpt/global/core/dataset/v2/api';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { NextAPI } from '@/service/middleware/entry';
import { getS3ChatSource } from '@fastgpt/service/common/s3/sources/chat';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import type { NextApiResponse } from 'next';

// Short Preview Link
async function handler(req: ApiRequestProps<ShortPreviewLinkParams>, res: NextApiResponse) {
  const parsed = ShortPreviewLinkSchema.parse(req.query);
  const { k: redisKey } = parsed;

  await authCert({ req, authToken: true });

  const redis = getGlobalRedisConnection();
  const objectKey = await redis.get(redisKey);
  if (!objectKey) {
    res.status(404).end();
    return;
  }

  const s3ChatSource = getS3ChatSource();
  const s3DatasetSource = getS3DatasetSource();

  if (s3ChatSource.isChatFileKey(objectKey)) {
    res.redirect(302, await s3ChatSource.createGetChatFileURL({ key: objectKey, external: true }));
  } else if (s3DatasetSource.isDatasetObjectKey(objectKey)) {
    res.redirect(
      302,
      await s3DatasetSource.createGetDatasetFileURL({ key: objectKey, external: true })
    );
  }

  res.status(404).end();
}

export default NextAPI(handler);
