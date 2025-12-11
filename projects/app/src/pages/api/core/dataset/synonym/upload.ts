import type { NextApiRequest, NextApiResponse } from 'next';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { uploadSynonymFile } from '@fastgpt/service/core/dataset/synonym/controller';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { getUploadModel } from '@fastgpt/service/common/file/multer';
import { removeFilesByPaths } from '@fastgpt/service/common/file/utils';
import { NextAPI } from '@/service/middleware/entry';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';

/**
 * 同义词上传API
 * POST /api/core/dataset/synonym/upload
 *
 * 功能：上传同义词文件到指定知识库
 * 业务规则：
 * - 一个知识库只能有一个同义词文件
 * - 上传新文件会自动替换旧文件
 * - 支持CSV、XLSX、XLS格式文件
 * - CSV文件编码支持UTF-8、GBK
 * - Excel文件只读取第一个sheet
 * - 文件格式：第一行为表头，第一列为标准词，后续列为同义词
 */

export type UploadSynonymFileBody = {
  datasetId: string;
};

export type UploadSynonymFileResponse = {
  synonymId: string;
  fileName: string;
  size: number;
  uploadTime: Date;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<UploadSynonymFileResponse> {
  let filePaths: string[] = [];

  try {
    // 1. 创建multer上传处理器
    const upload = getUploadModel({
      maxSize: 50 * 1024 * 1024 // 限制50MB
    });

    // 2. 接收上传的文件
    const { file, data } = await upload.getUploadFile<UploadSynonymFileBody>(
      req,
      res,
      BucketNameEnum.dataset
    );

    if (!file) {
      throw new Error(CommonErrEnum.fileNotFound);
    }

    filePaths = [file.path];
    const { datasetId } = data;

    // 3. 验证文件格式（支持csv、xlsx、xls）
    const fileName = file.originalname.toLowerCase();
    const isValidFormat =
      fileName.endsWith('.csv') || fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

    if (!isValidFormat) {
      throw new Error(DatasetErrEnum.synonymFileUnsupportedFormat);
    }

    // 4. 权限校验 - 需要知识库写权限
    const { teamId, tmbId } = await authDataset({
      req,
      authToken: true,
      authApiKey: true,
      datasetId,
      per: WritePermissionVal
    });

    // 5. 上传同义词文件并创建映射
    const synonymFile = await uploadSynonymFile({
      teamId: String(teamId),
      datasetId: String(datasetId),
      uploaderId: String(tmbId),
      filePath: file.path,
      fileName: file.originalname,
      fileSize: file.size
    });

    // 6. 清理临时文件
    removeFilesByPaths(filePaths);

    // 7. 返回结果
    return {
      synonymId: String(synonymFile._id),
      fileName: synonymFile.fileName,
      size: synonymFile.size,
      uploadTime: synonymFile.uploadTime
    };
  } catch (error) {
    // 清理临时文件
    removeFilesByPaths(filePaths);
    throw error;
  }
}

// 禁用Next.js默认的body parser，使用multer处理multipart/form-data
export const config = {
  api: {
    bodyParser: false
  }
};

export default NextAPI(handler);
