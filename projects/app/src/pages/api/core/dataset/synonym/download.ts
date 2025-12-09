import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoDatasetSynonym } from '@fastgpt/service/core/dataset/synonym/schema';
import { getDownloadStream } from '@fastgpt/service/common/file/gridfs/controller';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';

/**
 * 同义词文件下载API
 * GET /api/core/dataset/synonym/download?id=xxx
 *
 * 功能：下载指定的同义词原文件
 * 返回：文件流（CSV格式）
 */

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query as { id: string };

  if (!id) {
    throw new Error(CommonErrEnum.missingParams);
  }

  // 1. 查找同义词文件记录
  const synonymFile = await MongoDatasetSynonym.findById(new Types.ObjectId(id)).lean();

  if (!synonymFile) {
    throw new Error(DatasetErrEnum.synonymFileNotExist);
  }

  // 2. 权限校验 - 需要知识库读权限
  await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: String(synonymFile.datasetId),
    per: ReadPermissionVal
  });

  // 3. 从GridFS获取文件流
  const fileStream = await getDownloadStream({
    bucketName: BucketNameEnum.dataset,
    fileId: String(synonymFile.fileId)
  });

  // 4. 设置响应头
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(synonymFile.fileName)}"`
  );

  // 5. 将文件流pipe到响应
  fileStream.pipe(res);
}

export default NextAPI(handler);
