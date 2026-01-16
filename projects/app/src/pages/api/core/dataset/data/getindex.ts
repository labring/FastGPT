import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';

export type GetDatasetDataIndexProps = {
  dataId: string;
  collectionId: string;
  datasetId: string;
};

export type GetDatasetDataIndexResponse = {
  index: number; // 数据在列表中的位置索引，从 0 开始；-1 表示数据已被删除
};

async function handler(
  req: ApiRequestProps<GetDatasetDataIndexProps>
): Promise<GetDatasetDataIndexResponse> {
  const { dataId, collectionId, datasetId } = req.body;

  // 权限校验
  const { teamId, collection } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId,
    per: ReadPermissionVal
  });

  // 验证 datasetId 是否匹配
  if (String(collection.datasetId) !== String(datasetId)) {
    throw new Error(DatasetErrEnum.datasetIdMismatch);
  }

  // 查询目标数据是否存在
  const targetData = await MongoDatasetData.findOne({
    _id: dataId,
    teamId,
    datasetId,
    collectionId
  }).lean();

  // 如果数据不存在，返回 index: -1
  if (!targetData) {
    return { index: -1 };
  }

  // 查询在该数据之前有多少条数据（按照 chunkIndex 升序，updateTime 降序排序）
  const count = await MongoDatasetData.countDocuments({
    teamId,
    datasetId,
    collectionId,
    $or: [
      { chunkIndex: { $lt: targetData.chunkIndex } },
      {
        chunkIndex: targetData.chunkIndex,
        updateTime: { $gt: targetData.updateTime }
      }
    ]
  });

  return { index: count };
}

export default NextAPI(handler);
