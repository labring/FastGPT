import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { listSynonymFiles } from '@fastgpt/service/core/dataset/synonym/controller';
import type { DatasetSynonymSchemaType } from '@fastgpt/global/core/dataset/type';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

/**
 * 同义词列表查询API
 * GET /api/core/dataset/synonym/list?datasetId=xxx
 *
 * 功能：查询指定知识库的同义词文件列表
 * 返回：同义词文件元数据数组，按上传时间倒序排列
 */

export type ListSynonymFilesQuery = {
  datasetId: string;
};

export type ListSynonymFilesResponse = {
  files: (DatasetSynonymSchemaType & { uploaderName?: string })[];
};

async function handler(
  req: ApiRequestProps<{}, ListSynonymFilesQuery>
): Promise<ListSynonymFilesResponse> {
  const { datasetId } = req.query;

  if (!datasetId) {
    throw new Error(CommonErrEnum.missingParams);
  }

  // 1. 权限校验 - 需要知识库读权限
  const { teamId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: ReadPermissionVal
  });

  // 2. 查询同义词文件列表
  const files = await listSynonymFiles({
    teamId: String(teamId),
    datasetId: String(datasetId)
  });

  // 3. 查询上传者姓名
  const uploaderIds = files.map((file) => file.uploaderId);
  const uploaders = await MongoTeamMember.find({ _id: { $in: uploaderIds } }, 'name').lean();

  const uploaderMap = new Map(uploaders.map((u) => [String(u._id), u.name]));

  // 4. 合并上传者姓名到文件列表
  const filesWithUploader = files.map((file) => ({
    ...file,
    uploaderName: uploaderMap.get(file.uploaderId)
  }));

  // 5. 返回结果
  return {
    files: filesWithUploader
  };
}

export default NextAPI(handler);
