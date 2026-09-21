import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { BatchDownloadDatasetCollectionsBodySchema } from '@fastgpt/global/openapi/core/dataset/collection/batchDownloadApi';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import {
  assertMemberRateLimit,
  MemberRateLimitPolicy
} from '@fastgpt/service/common/rateLimit/interface/member';
import { serviceEnv } from '@fastgpt/service/env';
import {
  assertDatasetArchiveCollectionsReadable,
  prepareDatasetArchive,
  streamDatasetArchiveResponse,
  withDatasetArchiveResources
} from '@/service/core/dataset/collection/archive';
import { getContentDisposition } from '@fastgpt/global/common/file/tools';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { createS3ProxyAbortContext } from '@/service/common/s3/proxy';

const logger = getLogger(LogCategories.MODULE.DATASET.COLLECTION);

async function handler(req: ApiRequestProps, res: NextApiResponse): Promise<void> {
  const { collectionIds } = parseApiInput({
    req,
    bodySchema: BatchDownloadDatasetCollectionsBodySchema
  }).body;
  const { collection, teamId, tmbId, isRoot } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId: collectionIds[0],
    per: ReadPermissionVal
  });
  const dataset = collection.dataset;

  if (!dataset || dataset.type !== DatasetTypeEnum.dataset) {
    throw DatasetErrEnum.archiveUnsupportedDataset;
  }

  try {
    await withDatasetArchiveResources({
      tmbId: String(tmbId),
      concurrency: serviceEnv.DATASET_ARCHIVE_MAX_CONCURRENCY,
      fn: async ({ signals, assertValid }) => {
        const abortContext = createS3ProxyAbortContext({ req, res });
        const signal = AbortSignal.any([abortContext.signal, ...signals]);
        try {
          signal.throwIfAborted();
          await assertMemberRateLimit({
            policy: MemberRateLimitPolicy.DownloadDatasetArchive,
            memberId: String(tmbId)
          });

          const manifest = await prepareDatasetArchive({
            teamId: String(teamId),
            datasetId: String(collection.datasetId),
            datasetName: dataset.name,
            collectionIds,
            signal,
            assertCollectionsReadable: (archiveCollectionIds) =>
              assertDatasetArchiveCollectionsReadable({
                teamId: String(teamId),
                datasetId: String(collection.datasetId),
                tmbId: String(tmbId),
                isRoot,
                collectionIds: archiveCollectionIds
              })
          });
          assertValid();
          signal.throwIfAborted();

          res.setHeader('Content-Type', 'application/zip');
          res.setHeader(
            'Content-Disposition',
            getContentDisposition({
              filename: `collections-${Date.now()}.zip`,
              type: 'attachment'
            })
          );
          res.setHeader('Cache-Control', 'no-store, no-transform');
          res.setHeader('X-Accel-Buffering', 'no');

          await streamDatasetArchiveResponse({
            res,
            manifest,
            signal,
            assertLeaseValid: assertValid
          });
        } finally {
          abortContext.cleanup();
        }
      }
    });
  } catch (error) {
    if (!res.headersSent) {
      // 已设置 ZIP 头但尚未写正文时，恢复 NextAPI 的 JSON 错误响应语义。
      ['Content-Type', 'Content-Disposition', 'Cache-Control', 'X-Accel-Buffering'].forEach(
        (header) => res.removeHeader(header)
      );
      throw error;
    }

    logger.error('Dataset archive stream failed after response started', { error });
    if (!res.destroyed) {
      res.destroy(error instanceof Error ? error : undefined);
    }
  }
}

export default NextAPI(handler);

export const config = {
  api: {
    responseLimit: false
  }
};
