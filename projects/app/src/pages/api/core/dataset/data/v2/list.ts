import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import type { DatasetDataListItemType } from '@/global/core/dataset/type';
import type { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { MongoDatasetImageSchema } from '@fastgpt/service/core/dataset/image/schema';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { getDatasetImagePreviewUrl } from '@fastgpt/service/core/dataset/image/utils';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import { addHours } from 'date-fns';
import { jwtSignS3ObjectKey } from '@fastgpt/service/common/s3/utils';
import { replaceDatasetQuoteTextWithJWT } from '@fastgpt/service/core/dataset/utils';

export type GetDatasetDataListProps = PaginationProps & {
  searchText?: string;
  collectionId: string;
};
export type GetDatasetDataListRes = PaginationResponse<DatasetDataListItemType>;

async function handler(
  req: ApiRequestProps<GetDatasetDataListProps>
): Promise<GetDatasetDataListRes> {
  let { searchText = '', collectionId } = req.body;
  let { offset, pageSize } = parsePaginationRequest(req);

  pageSize = Math.min(pageSize, 30);

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
    MongoDatasetData.find(match, '_id datasetId collectionId q a chunkIndex imageId teamId')
      .sort({ chunkIndex: 1, _id: -1 })
      .skip(offset)
      .limit(pageSize)
      .lean(),
    MongoDatasetData.countDocuments(match)
  ]);

  list.forEach((item) => {
    item.q = replaceDatasetQuoteTextWithJWT(item.q, addHours(new Date(), 1));
    if (item.a) {
      item.a = replaceDatasetQuoteTextWithJWT(item.a, addHours(new Date(), 1));
    }
  });

  const imageIds = list.map((item) => item.imageId!).filter(Boolean);
  const imageSizeMap = new Map<string, number>();
  const s3DatasetSource = getS3DatasetSource();

  if (imageIds.length > 0) {
    const imageInfos = await MongoDatasetImageSchema.find(
      { _id: { $in: imageIds.filter((id) => !s3DatasetSource.isDatasetObjectKey(id)) } },
      '_id length',
      {
        ...readFromSecondary
      }
    ).lean();

    imageInfos.forEach((item) => {
      imageSizeMap.set(String(item._id), item.length);
    });

    const s3ImageIds = imageIds.filter((id) => s3DatasetSource.isDatasetObjectKey(id));
    for (const id of s3ImageIds) {
      imageSizeMap.set(id, (await s3DatasetSource.getFileMetadata(id)).contentLength);
    }
  }

  return {
    list: await Promise.all(
      list.map(async (item) => {
        const imageSize = item.imageId ? imageSizeMap.get(String(item.imageId)) : undefined;
        const imagePreviewUrl = item.imageId
          ? s3DatasetSource.isDatasetObjectKey(item.imageId)
            ? jwtSignS3ObjectKey(item.imageId, addHours(new Date(), 1))
            : getDatasetImagePreviewUrl({
                imageId: item.imageId,
                teamId,
                datasetId: collection.datasetId,
                expiredMinutes: 30
              })
          : undefined;

        return {
          ...item,
          imageSize,
          imagePreviewUrl
        };
      })
    ),
    total
  };
}

export default NextAPI(handler);
