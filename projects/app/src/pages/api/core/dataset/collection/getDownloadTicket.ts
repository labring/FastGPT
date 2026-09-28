import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetDownloadTicketDatasetCollectionsBodySchema,
  GetDownloadTicketDatasetCollectionsResponseSchema,
  type GetDownloadTicketDatasetCollectionsResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/batchDownloadApi';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
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
  withDatasetArchiveResources
} from '@/service/core/dataset/collection/archive';
import { createDatasetArchiveTicket } from '@/service/core/dataset/collection/archiveTicket';
import { createS3ProxyAbortContext } from '@/service/common/s3/proxy';

async function handler(
  req: ApiRequestProps,
  res: NextApiResponse
): Promise<GetDownloadTicketDatasetCollectionsResponseType> {
  const { datasetId, collectionIds } = parseApiInput({
    req,
    bodySchema: GetDownloadTicketDatasetCollectionsBodySchema
  }).body;
  const { dataset, teamId, tmbId, isRoot } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: ReadPermissionVal
  });

  if (dataset.type !== DatasetTypeEnum.dataset) {
    throw DatasetErrEnum.archiveUnsupportedDataset;
  }

  const result = await withDatasetArchiveResources({
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
          datasetId: String(dataset._id),
          datasetName: dataset.name,
          collectionIds,
          signal,
          assertCollectionsReadable: (archiveCollectionIds) =>
            assertDatasetArchiveCollectionsReadable({
              teamId: String(teamId),
              datasetId: String(dataset._id),
              tmbId: String(tmbId),
              isRoot,
              collectionIds: archiveCollectionIds
            })
        });
        assertValid();
        signal.throwIfAborted();

        return createDatasetArchiveTicket({
          tmbId: String(tmbId),
          teamId: String(teamId),
          datasetId: String(dataset._id),
          manifest
        });
      } finally {
        abortContext.cleanup();
      }
    }
  });

  return GetDownloadTicketDatasetCollectionsResponseSchema.parse(result);
}

export default NextAPI(handler);
