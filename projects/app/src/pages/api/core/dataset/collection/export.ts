import { NextAPI } from '@/service/middleware/entry';
import { authChatTargetCrud, authCollectionInChat } from '@/service/support/permission/auth/chat';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { useIPFrequencyLimit } from '@fastgpt/service/common/middle/reqFrequencyLimit';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { responseWriteController } from '@fastgpt/service/common/response';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { getCollectionWithDataset } from '@fastgpt/service/core/dataset/controller';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { type NextApiResponse } from 'next';
import { sanitizeCsvField } from '@fastgpt/service/common/file/csv';
import { replaceS3KeyToPreviewUrl } from '@fastgpt/service/core/dataset/utils';
import { addDays } from 'date-fns';
import { ExportCollectionBodySchema } from '@fastgpt/global/openapi/core/dataset/collection/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
const logger = getLogger(LogCategories.MODULE.DATASET.COLLECTION);

async function handler(req: ApiRequestProps, res: NextApiResponse) {
  const parseBody = parseApiInput({ req, bodySchema: ExportCollectionBodySchema }).body;
  const collectionId = parseBody.collectionId;

  const {
    collection,
    teamId: userTeamId,
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

  write(`\uFEFFq,a`);

  cursor.on('data', (doc) => {
    const sanitizedQ = replaceS3KeyToPreviewUrl(
      sanitizeCsvField(doc.q || ''),
      addDays(new Date(), 90)
    );
    const sanitizedA = replaceS3KeyToPreviewUrl(
      sanitizeCsvField(doc.a || ''),
      addDays(new Date(), 90)
    );

    write(`\n${sanitizedQ},${sanitizedA}`);
  });

  cursor.on('end', () => {
    cursor.close();
    res.end();
  });

  cursor.on('error', (err) => {
    logger.error(`export usage error`, { error: err });
    res.status(500);
    res.end();
  });
}

export default NextAPI(
  useIPFrequencyLimit({ id: 'export-usage', seconds: 60, limit: 1, force: true }),
  handler
);
