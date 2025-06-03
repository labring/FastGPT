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

  const imageIds = list.map((item) => item.imageId!).filter(Boolean);
  const imageSizeMap = new Map<string, number>();

  if (imageIds.length > 0) {
    const imageInfos = await MongoDatasetImageSchema.find(
      { _id: { $in: imageIds } },
      '_id length',
      {
        ...readFromSecondary
      }
    ).lean();

    imageInfos.forEach((item) => {
      imageSizeMap.set(String(item._id), item.length);
    });
  }

  return {
    list: list.map((item) => {
      const imageSize = item.imageId ? imageSizeMap.get(String(item.imageId)) : undefined;
      const imagePreviewUrl = item.imageId
        ? getDatasetImagePreviewUrl({
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
    }),
    total
  };
}

export default NextAPI(handler);
