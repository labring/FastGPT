import { NextAPI } from '@/service/middleware/entry';
import { authChatTargetCrud, authCollectionInChat } from '@/service/support/permission/auth/chat';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  assertMemberRateLimit,
  MemberRateLimitPolicy
} from '@fastgpt/service/common/rateLimit/interface/member';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { responseWriteController } from '@fastgpt/service/common/response';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { getCollectionWithDataset } from '@fastgpt/service/core/dataset/controller';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { type NextApiResponse } from 'next';
import { sanitizeCsvField } from '@fastgpt/service/common/file/csv';
import { replaceS3KeysToPreviewUrls } from '@fastgpt/service/common/s3/utils/preview';
import { serviceEnv } from '@fastgpt/service/env';
import { addDays } from 'date-fns';
import { ExportCollectionBodySchema } from '@fastgpt/global/openapi/core/dataset/collection/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
const logger = getLogger(LogCategories.MODULE.DATASET.COLLECTION);

async function handler(req: ApiRequestProps, res: NextApiResponse) {
  const parseBody = parseApiInput({ req, bodySchema: ExportCollectionBodySchema }).body;
  const collectionId = parseBody.collectionId;

  const {
    collection,
    teamId: userTeamId,
    tmbId,
    chatTime
  } = await (async () => {
    if (!('chatItemDataId' in parseBody)) {
      const result = await authDatasetCollection({
        req,
        authToken: true,
        authApiKey: true,
        collectionId,
        per: ReadPermissionVal
      });
      return {
        ...result,
        chatTime: undefined
      };
    }

    const { sourceType, sourceId, chatId, outLinkAuthData, chatTime } = parseBody;
    /*
      1. auth chat read permission
      2. auth collection quote in chat
      3. auth outlink open show quote
    */
    const authRes = await authChatTargetCrud({
      req,
      authToken: true,
      authApiKey: true,
      sourceType,
      sourceId,
      chatId,
      outLinkAuthData
    });
    const resolvedSourceId = authRes.sourceId;

    const [collection] = await Promise.all([
      getCollectionWithDataset(collectionId),
      authCollectionInChat({
        sourceType,
        sourceId: resolvedSourceId,
        chatId,
        collectionIds: [collectionId]
      })
    ]);

    if (!authRes.canDownloadSource) {
      return Promise.reject(DatasetErrEnum.unAuthDatasetFile);
    }

    return {
      ...authRes,
      collection,
      chatTime
    };
  })();

  await assertMemberRateLimit({
    policy: MemberRateLimitPolicy.ExportDataset,
    memberId: String(tmbId)
  });

  const where = {
    teamId: userTeamId,
    datasetId: collection.datasetId,
    collectionId,
    ...(chatTime
      ? {
          $or: [
            { updateTime: { $lt: new Date(chatTime) } },
            { history: { $elemMatch: { updateTime: { $lt: new Date(chatTime) } } } }
          ]
        }
      : {})
  };

  res.setHeader('Content-Type', 'text/csv; charset=utf-8;');
  res.setHeader('Content-Disposition', 'attachment; filename=data.csv; ');

  const cursor = MongoDatasetData.find(where, 'q a', {
    ...readFromSecondary,
    batchSize: 1000
  })
    .sort({ chunkIndex: 1 })
    .limit(50000)
    .cursor();

  const write = responseWriteController({
    res,
    readStream: cursor
  });
  let exportedCount = 0;
  let auditFinished = false;
  let auditPromise: Promise<void> | undefined;
  const recordExportAudit = async (
    result: 'success' | 'failed',
    failureReason?: string
  ): Promise<void> => {
    if (auditFinished) {
      await auditPromise;
      return;
    }
    auditFinished = true;
    auditPromise = addAuditLog({
      teamId: String(userTeamId),
      tmbId,
      event: AuditEventEnum.EXPORT_DATASET_CONTENT,
      params: {
        datasetId: String(collection.datasetId),
        datasetName: collection.dataset.name,
        collectionName: collection.name,
        exportScope: 'chatItemDataId' in parseBody ? 'chat_quote' : 'collection',
        objectType: 'data',
        result,
        count: String(exportedCount),
        details: [
          {
            resourceId: collectionId,
            resourceName: collection.name,
            resourceType: 'collection',
            action: 'export',
            result,
            ...(failureReason ? { failureReason } : {}),
            processingParams: {
              objectType: 'data',
              count: exportedCount,
              exportScope: 'chatItemDataId' in parseBody ? 'chat_quote' : 'collection'
            }
          }
        ],
        ...(failureReason ? { failureReason } : {})
      }
    });
    await auditPromise;
  };

  write(`\uFEFFq,a`);

  cursor.on('data', async (doc) => {
    cursor.pause();

    try {
      const [sanitizedQ, sanitizedA] = await replaceS3KeysToPreviewUrls(
        [sanitizeCsvField(doc.q || ''), sanitizeCsvField(doc.a || '')],
        addDays(new Date(), serviceEnv.FILE_URL_EXPIRED_DAYS)
      );

      write(`\n${sanitizedQ},${sanitizedA}`);
      exportedCount += 1;
    } catch (error) {
      logger.error(`export usage error`, { error });
      await recordExportAudit('failed', getErrText(error));
      cursor.destroy();
      return;
    }

    cursor.resume();
  });

  cursor.on('end', async () => {
    cursor.close();
    try {
      await recordExportAudit('success');
    } catch (error) {
      logger.error('collection export audit write failed', { error });
    }
    res.end();
  });

  cursor.on('error', async (err) => {
    logger.error(`export usage error`, { error: err });
    try {
      await recordExportAudit('failed', getErrText(err));
    } catch (error) {
      logger.error('collection export audit write failed', { error });
    }
    res.status(500);
    res.end();
  });
}

export default NextAPI(handler);
