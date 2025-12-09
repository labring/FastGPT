import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { deleteSynonymFile } from '@fastgpt/service/core/dataset/synonym/controller';
import { MongoDatasetSynonym } from '@fastgpt/service/core/dataset/synonym/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

/**
 * 同义词文件删除API
 * DELETE /api/core/dataset/synonym/delete?id=xxx
 *
 * 功能：删除指定的同义词文件及其所有映射关系
 * 操作：
 * - 删除GridFS中的文件
 * - 删除所有相关的同义词映射记录
 * - 删除同义词文件元数据
 * - 更新知识库的synonymFiles字段
 */

export type DeleteSynonymFileResponse = {
  success: boolean;
};

async function handler(
  req: ApiRequestProps<{}, { id: string }>
): Promise<DeleteSynonymFileResponse> {
  const { id } = req.query;

  if (!id) {
    throw new Error(CommonErrEnum.missingParams);
  }

  // 1. 查找同义词文件记录
  const synonymFile = await MongoDatasetSynonym.findById(new Types.ObjectId(id)).lean();

  if (!synonymFile) {
    throw new Error(DatasetErrEnum.synonymFileNotExist);
  }

  // 2. 权限校验 - 需要知识库写权限
  const { teamId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: String(synonymFile.datasetId),
    per: WritePermissionVal
  });

  // 3. 删除同义词文件及其所有映射
  await deleteSynonymFile({
    synonymId: id,
    teamId: String(teamId),
    datasetId: String(synonymFile.datasetId)
  });

  // 4. 返回结果
  return {
    success: true
  };
}

export default NextAPI(handler);
