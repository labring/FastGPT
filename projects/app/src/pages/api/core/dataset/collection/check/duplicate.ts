import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';

export type CheckDuplicateFileNamesQuery = {};
export type CheckDuplicateFileNamesBody = {
  datasetId: string;
  fileNames: string[];
};
export type CheckDuplicateFileNamesResponse = {
  duplicateFileNames: string[];
};

async function handler(
  req: ApiRequestProps<CheckDuplicateFileNamesBody, CheckDuplicateFileNamesQuery>,
  res: ApiResponseType<CheckDuplicateFileNamesResponse>
): Promise<CheckDuplicateFileNamesResponse> {
  const { datasetId, fileNames } = req.body;

  // 参数校验
  if (!datasetId || !Array.isArray(fileNames) || fileNames.length === 0) {
    throw new Error('Invalid parameters: datasetId and fileNames are required');
  }

  // 权限校验（只需要读权限即可查询重名）
  await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    per: ReadPermissionVal,
    datasetId
  });

  // 查询数据库中该知识库下所有文件类型的集合名称
  const existingCollections = await MongoDatasetCollection.find(
    {
      datasetId,
      type: DatasetCollectionTypeEnum.file
    },
    {
      name: 1, // 只查询 name 字段
      _id: 0
    }
  ).lean();

  // 提取现有的文件名列表
  const existingFileNames = existingCollections.map((collection) => collection.name);

  // 找出重复的文件名
  const duplicateFileNames = fileNames.filter((fileName) => existingFileNames.includes(fileName));

  return {
    duplicateFileNames
  };
}

export default NextAPI(handler);
