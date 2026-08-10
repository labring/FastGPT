import type { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';

import { readMongoImg } from '@fastgpt/service/common/file/image/controller';
import { Types } from '@fastgpt/service/common/mongo';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';
import { encodeS3ObjectKey } from '@fastgpt/service/common/s3/keySanitizer';
import { storageDownloadUrlMode } from '@fastgpt/service/common/s3/config/constants';
import { handleS3ProxyDownload, handleS3ProxyRouteError } from '@/service/common/s3/proxy';

// get the models available to the system
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { id } = req.query as { id: string[] };

    const joined = id.join('/');
    const parsed = path.parse(joined);
    const keys = path.format({ dir: parsed.dir, name: parsed.name, ext: '' });

    if (Types.ObjectId.isValid(keys)) {
      const { binary, mime } = await readMongoImg({ id: joined });
      res.setHeader('Content-Type', mime);
      res.send(binary);
      return;
    }

    const avatarSource = getS3AvatarSource();
    // Next.js 已将动态路由参数解码，重新编码后才能命中存储中的 canonical key。
    const canonicalKey = encodeS3ObjectKey(joined);

    if (storageDownloadUrlMode === 'short-redirect') {
      const resolvedKey = await avatarSource.resolveExistingObjectKey(canonicalKey);
      if (!resolvedKey) {
        res.status(404).end();
        return;
      }

      const publicUrl = avatarSource.createPublicUrl(resolvedKey);
      res.redirect(301, publicUrl);
      return;
    }

    return await handleS3ProxyDownload({
      req,
      res,
      payload: {
        bucketName: avatarSource.bucketName,
        objectKey: canonicalKey
      }
    });
  } catch (error) {
    return handleS3ProxyRouteError({ res, error });
  }
}
