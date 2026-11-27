import { DatasetAuditEventEnum } from '@fastgpt/global/core/dataset/audit/constants/event';
import { NextAPI } from '@/service/middleware/entry';
import { authChatTargetCrud } from '@fastgpt/service/core/chat/auth';
import { authCollectionInChat } from '@/service/support/permission/auth/chat';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { AuthUserTypeEnum, ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  assertMemberRateLimit,
  MemberRateLimitPolicy
} from '@fastgpt/service/common/rateLimit/interface/member';
import { iterateCursor, readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { getCollectionWithDataset } from '@fastgpt/service/core/dataset/controller';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { type NextApiResponse } from 'next';
import { writeXlsxResponse } from '@fastgpt/service/common/file/xlsx/response';
import { replaceS3KeysToPreviewUrls } from '@fastgpt/service/common/s3/utils/preview';
import { createDatasetFileS3KeyFilter } from '@fastgpt/service/common/s3/sources/dataset/key';
import { getStorageFileUrlExpiredTime } from '@fastgpt/service/common/s3/config/constants';
import { ExportCollectionBodySchema } from '@fastgpt/global/openapi/core/dataset/collection/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { buildCollectionExportAuditLog } from '@fastgpt/service/core/dataset/audit/collection';
async function handler(req: ApiRequestProps, res: NextApiResponse) {
  const parseBody = parseApiInput({ req, bodySchema: ExportCollectionBodySchema }).body;
  const collectionId = parseBody.collectionId;

  const {
    collection,
    teamId: userTeamId,
    tmbId,
    chatTime,
    authType
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

    const { customUid, authProxy, sourceType, sourceId, chatId, outLinkAuthData, chatTime } =
      parseBody;
    /*
      1. auth chat read permission
      2. auth collection quote in chat
      3. auth outlink open show quote
    */
    const authRes = await authChatTargetCrud({
      customUid,
      authProxy,
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

  const shouldAuditExport =
    !('chatItemDataId' in parseBody) &&
    (authType === AuthUserTypeEnum.token || authType === AuthUserTypeEnum.root);

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

  async function* rows(signal: AbortSignal) {
    yield ['q', 'a'];
    const cursor = MongoDatasetData.find(where, 'q a', {
      ...readFromSecondary,
      batchSize: 1000
    })
      .sort({ chunkIndex: 1 })
      .limit(50000)
      .cursor();
    for await (const doc of iterateCursor(cursor, signal)) {
      yield await replaceS3KeysToPreviewUrls(
        [doc.q || '', doc.a || ''],
        getStorageFileUrlExpiredTime(),
        {
          filter: createDatasetFileS3KeyFilter(collection.datasetId)
        }
      );
    }
  }

  try {
    await writeXlsxResponse({ res, filename: 'data.xlsx', sheet: { name: 'Data', rows } });
  } finally {
    if (shouldAuditExport) {
      void addAuditLog(
        buildCollectionExportAuditLog({
          tmbId,
          collection,
          event: DatasetAuditEventEnum.DATASET_COLLECTION_QA_EXPORT
        })
      );
    }
  }
}

export const config = { api: { responseLimit: false } };
export default NextAPI(handler);
