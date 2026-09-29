import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { MongoDatasetImageSchema } from '@fastgpt/service/core/dataset/image/schema';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import { addHours } from 'date-fns';
import { isS3ObjectKey } from '@fastgpt/service/common/s3/utils';
import { replaceS3KeysToPreviewUrls } from '@fastgpt/service/common/s3/utils/preview';
import {
  GetDatasetDataListBodySchema,
  GetDatasetDataListResponseSchema,
  type GetDatasetDataListResponse
} from '@fastgpt/global/openapi/core/dataset/data/api';
import { S3Buckets } from '@fastgpt/service/common/s3/config/constants';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { createS3DownloadAccessUrl } from '@fastgpt/service/common/s3/accessLink';
import {
  createDatasetFileS3KeyFilter,
  isAuthorizedDatasetFileS3Key
} from '@fastgpt/service/common/s3/sources/dataset/key';

async function handler(req: ApiRequestProps): Promise<GetDatasetDataListResponse> {
  const { searchText = '', collectionId } = parseApiInput({
    req,
    bodySchema: GetDatasetDataListBodySchema
  }).body;
  const { offset, pageSize: rawPageSize } = parsePaginationRequest(req);

  const pageSize = Math.min(rawPageSize, 30);

  const { teamId, collection } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId,
    per: ReadPermissionVal
  });

  const queryReg = new RegExp(`${replaceRegChars(searchText)}`, 'i');
  const match = {
    teamId,
    datasetId: collection.datasetId,
    collectionId,
    ...(searchText.trim()
      ? {
          $or: [{ q: queryReg }, { a: queryReg }]
        }
      : {})
  };

  const [list, total] = await Promise.all([
    MongoDatasetData.find(match, '_id datasetId collectionId q a chunkIndex imageId')
      .sort({ chunkIndex: 1, _id: -1 })
      .skip(offset)
      .limit(pageSize)
      .lean(),
    MongoDatasetData.countDocuments(match)
  ]);

  const previewTexts = list.flatMap(({ q, a }) => (a ? [q, a] : [q]));
  const previewTextsWithUrls = await replaceS3KeysToPreviewUrls(
    previewTexts,
    addHours(new Date(), 1),
    {
      filter: createDatasetFileS3KeyFilter(collection.datasetId)
    }
  );
  let previewTextIndex = 0;
  list.forEach((item) => {
    item.q = previewTextsWithUrls[previewTextIndex++] ?? item.q;
    if (item.a) {
      item.a = previewTextsWithUrls[previewTextIndex++] ?? item.a;
    }
  });

  const imageIds = list.map((item) => item.imageId!).filter(Boolean);
  const imageSizeMap = new Map<string, number>();

  if (imageIds.length > 0) {
    const imageInfos = await MongoDatasetImageSchema.find(
      { _id: { $in: imageIds.filter((id) => !isS3ObjectKey(id, 'dataset')) } },
      '_id length',
      {
        ...readFromSecondary
      }
    ).lean();

    imageInfos.forEach((item) => {
      imageSizeMap.set(String(item._id), item.length);
    });

    const s3ImageIds = imageIds.filter(
      (id) =>
        isS3ObjectKey(id, 'dataset') &&
        isAuthorizedDatasetFileS3Key({ key: id, datasetId: collection.datasetId })
    );
    await batchRun(
      s3ImageIds,
      async (id) => {
        const metadata = await getS3DatasetSource().getFileMetadata(id);
        if (metadata?.contentLength) {
          imageSizeMap.set(id, metadata.contentLength);
        }
      },
      5
    );
  }

  const formatList = await Promise.all(
    list.map(async (item) => {
      const imageSize = item.imageId ? imageSizeMap.get(String(item.imageId)) : undefined;
      const imagePreviewUrl =
        item.imageId &&
        isS3ObjectKey(item.imageId, 'dataset') &&
        isAuthorizedDatasetFileS3Key({ key: item.imageId, datasetId: collection.datasetId })
          ? await createS3DownloadAccessUrl({
              objectKey: item.imageId,
              bucketName: S3Buckets.private,
              expiredTime: addHours(new Date(), 1)
            })
          : undefined;

      return {
        ...item,
        imageSize,
        imagePreviewUrl
      };
    })
  );

  return GetDatasetDataListResponseSchema.parse({
    total,
    list: formatList
  });
}

export default NextAPI(handler);
