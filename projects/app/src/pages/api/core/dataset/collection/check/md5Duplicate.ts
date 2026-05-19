import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';

export type CheckMd5DuplicateQuery = {};
export type CheckMd5DuplicateBody = {
  datasetId: string;
  md5Map: Record<string, string>; // key: fileName, value: md5
};
export type Md5DuplicateType = 'batch' | 'dataset';

export type CheckMd5DuplicateItem = {
  md5: string;
  type: Md5DuplicateType;
  /** 同批次重复时：第一个出现的文件名 */
  existingFileName: string;
  /** 重复的文件名（同批次内重复 或 与知识库已有文件重复） */
  newFileName: string;
};

export type CheckMd5DuplicateResponse = {
  duplicates: CheckMd5DuplicateItem[];
};

async function handler(
  req: ApiRequestProps<CheckMd5DuplicateBody, CheckMd5DuplicateQuery>,
  res: ApiResponseType<CheckMd5DuplicateResponse>
): Promise<CheckMd5DuplicateResponse> {
  const { datasetId, md5Map } = req.body;

  // 参数校验
  if (!datasetId || !md5Map || Object.keys(md5Map).length === 0) {
    throw new Error('Invalid parameters: datasetId and md5Map are required');
  }

  // 权限校验（读权限即可）
  await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    per: ReadPermissionVal,
    datasetId
  });

  const duplicates: CheckMd5DuplicateItem[] = [];

  // 1. 同批次内去重：按 MD5 分组，每组只保留第一个
  const seenMd5 = new Map<string, string>(); // md5 -> first fileName
  for (const [fileName, md5] of Object.entries(md5Map)) {
    if (seenMd5.has(md5)) {
      duplicates.push({
        md5,
        type: 'batch',
        existingFileName: seenMd5.get(md5)!,
        newFileName: fileName
      });
    } else {
      seenMd5.set(md5, fileName);
    }
  }

  // 2. 与知识库内已有文件去重
  if (seenMd5.size > 0) {
    const uniqueMd5Values = Array.from(seenMd5.keys());
    const existingCollections = await MongoDatasetCollection.find(
      {
        datasetId,
        type: { $in: [DatasetCollectionTypeEnum.file, DatasetCollectionTypeEnum.images] },
        fileMd5: { $in: uniqueMd5Values }
      },
      {
        name: 1,
        fileMd5: 1,
        _id: 0
      }
    ).lean();

    // 构建 md5 -> existingFileName 映射
    const md5ToExistingName = new Map<string, string>();
    for (const col of existingCollections) {
      if (col.fileMd5) {
        md5ToExistingName.set(col.fileMd5, col.name);
      }
    }

    // 构造与知识库已有文件的重复结果
    for (const [md5, newFileName] of seenMd5.entries()) {
      const existingFileName = md5ToExistingName.get(md5);
      if (existingFileName) {
        duplicates.push({
          md5,
          type: 'dataset',
          existingFileName,
          newFileName
        });
      }
    }
  }

  return { duplicates };
}

export default NextAPI(handler);
