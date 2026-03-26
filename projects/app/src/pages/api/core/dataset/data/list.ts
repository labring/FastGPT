import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { type DatasetDataListItemType } from '@/global/core/dataset/type';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { type PaginationResponse } from '@fastgpt/web/common/fetch/type';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import {
  DatasetTrainingStatusEnum,
  type DatasetTrainingStatusType
} from '@fastgpt/global/core/dataset/constants';

export type GetDatasetDataListProps = {
  searchText?: string;
  collectionId: string;
};

async function handler(
  req: ApiRequestProps<GetDatasetDataListProps>
): Promise<PaginationResponse<DatasetDataListItemType>> {
  let { searchText = '', collectionId } = req.body;
  let { offset, pageSize } = parsePaginationRequest(req);

  pageSize = Math.min(pageSize, 30);

  // 凭证校验
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
    MongoDatasetData.find(match, '_id datasetId collectionId q a chunkIndex')
      .sort({ chunkIndex: 1, updateTime: -1 })
      .skip(offset)
      .limit(pageSize)
      .lean(),
    MongoDatasetData.countDocuments(match)
  ]);

  // 只查当前页数据 ID 对应的训练记录，避免全量 distinct
  const dataIds = list.map((item) => item._id);
  const trainingRecords = await MongoDatasetTraining.find(
    { dataId: { $in: dataIds } },
    'dataId retryCount'
  ).lean();

  const trainingStatusMap = new Map<string, DatasetTrainingStatusType>();
  for (const record of trainingRecords) {
    trainingStatusMap.set(
      String(record.dataId),
      record.retryCount > 0 ? DatasetTrainingStatusEnum.training : DatasetTrainingStatusEnum.error
    );
  }

  return {
    list: list.map((item) => {
      const trainingStatus =
        trainingStatusMap.get(String(item._id)) ?? DatasetTrainingStatusEnum.ready;
      return { ...item, trainingStatus };
    }),
    total
  };
}

export default NextAPI(handler);
