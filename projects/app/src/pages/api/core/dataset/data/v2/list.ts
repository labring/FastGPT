import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetCollectionImage } from '@fastgpt/service/core/dataset/image/schema';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import type { DatasetDataListItemType } from '@/global/core/dataset/type';
import type { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';

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

  const imageIds = list.filter((item) => item.imageId).map((item) => item.imageId);
  let imageSizeMap: Record<string, number> = {};

  if (imageIds.length > 0) {
    const imageInfos = await MongoDatasetCollectionImage.find(
      { _id: { $in: imageIds } },
      '_id size'
    ).lean();

    imageSizeMap = imageInfos.reduce(
      (acc, img) => {
        acc[String(img._id)] = img.size;
        return acc;
      },
      {} as Record<string, number>
    );
  }

  const listWithImageSize = list.map((item) => ({
    ...item,
    ...(item.imageId && imageSizeMap[item.imageId]
      ? {
          imageSize: imageSizeMap[item.imageId]
        }
      : {})
  }));

  return {
    list: listWithImageSize,
    total
  };
}

export default NextAPI(handler);
