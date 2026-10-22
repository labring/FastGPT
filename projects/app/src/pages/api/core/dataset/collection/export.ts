import { DatasetAuditEventEnum } from '@fastgpt/global/core/dataset/constants';
import { NextAPI } from '@/service/middleware/entry';
import { authChatTargetCrud } from '@fastgpt/service/core/chat/auth';
import { authCollectionInChat } from '@/service/support/permission/auth/chat';
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
import { createDatasetFileS3KeyFilter } from '@fastgpt/service/common/s3/sources/dataset/key';
import { serviceEnv } from '@fastgpt/service/env';
import { addDays } from 'date-fns';
import { ExportCollectionBodySchema } from '@fastgpt/global/openapi/core/dataset/collection/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { getCollectionAuditObjectType } from '@fastgpt/service/core/dataset/collection/audit';
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
  // 流式导出没有统一完成点，用一次性开关保证成功/失败只落一条审计
  let auditFinished = false;
  const recordExportAudit = () => {
    if (auditFinished) return;

    auditFinished = true;
    void addAuditLog({
      teamId: String(userTeamId),
      tmbId,
      event: DatasetAuditEventEnum.DATASET_COLLECTION_EXPORT,
      params: {
        datasetName: collection.dataset.name,
        collectionName: collection.name,
        objectType: getCollectionAuditObjectType(collection.type),
        exportScope: 'chatItemDataId' in parseBody ? 'chat_quote' : 'collection'
      }
    });
  };

  write(`\uFEFFq,a`);

  cursor.on('data', async (doc) => {
    cursor.pause();

    try {
      const [sanitizedQ, sanitizedA] = await replaceS3KeysToPreviewUrls(
        [sanitizeCsvField(doc.q || ''), sanitizeCsvField(doc.a || '')],
        addDays(new Date(), serviceEnv.FILE_URL_EXPIRED_DAYS),
        {
          filter: createDatasetFileS3KeyFilter(collection.datasetId)
        }
      );

      write(`\n${sanitizedQ},${sanitizedA}`);
    } catch (error) {
      logger.error(`export usage error`, { error });
      recordExportAudit();
      cursor.destroy();
      return;
    }

    cursor.resume();
  });

  cursor.on('end', () => {
    cursor.close();
    recordExportAudit();
    res.end();
  });

  cursor.on('error', (err) => {
    logger.error(`export usage error`, { error: err });
    recordExportAudit();
    res.status(500);
    res.end();
  });
}

export default NextAPI(handler);
