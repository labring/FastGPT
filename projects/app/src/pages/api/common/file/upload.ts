// 导入 Next.js API 请求和响应类型
import type { NextApiRequest, NextApiResponse } from 'next';
// 导入自定义 JSON 响应函数
import { jsonRes } from '@fastgpt/service/common/response';
// 导入文件上传控制器
import { uploadFile } from '@fastgpt/service/common/file/gridfs/controller';
// 导入 multer 上传模型
import { getUploadModel } from '@fastgpt/service/common/file/multer';
// 导入文件路径删除工具
import { removeFilesByPaths } from '@fastgpt/service/common/file/utils';
// 导入 NextAPI 中间件
import { NextAPI } from '@/service/middleware/entry';
// 导入文件令牌创建函数
import { createFileToken } from '@fastgpt/service/support/permission/controller';
// 导入文件读取基础 URL
import { ReadFileBaseUrl } from '@fastgpt/global/common/file/constants';
// 导入日志添加函数
import { addLog } from '@fastgpt/service/common/system/log';
// 导入频率限制认证函数
import { authFrequencyLimit } from '@/service/common/frequencyLimit/api';
// 导入日期函数库
import { addSeconds } from 'date-fns';
// 导入聊天权限认证函数
import { authChatCrud } from '@/service/support/permission/auth/chat';
// 导入数据集权限认证函数
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
// 导入聊天权限属性类型
import { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
// 导入写权限常量
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';

// 上传聊天文件属性类型
export type UploadChatFileProps = {
  appId: string;
} & OutLinkChatAuthProps;
// 上传数据集文件属性类型
export type UploadDatasetFileProps = {
  datasetId: string;
};

// 认证上传限制函数
const authUploadLimit = (tmbId: string) => {
  if (!global.feConfigs.uploadFileMaxAmount) return;
  return authFrequencyLimit({
    eventId: `${tmbId}-uploadfile`,
    maxAmount: global.feConfigs.uploadFileMaxAmount * 2,
    expiredTime: addSeconds(new Date(), 30) // 30s
  });
};

// 处理请求的主函数
async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  const filePaths: string[] = [];
  try {
    const start = Date.now();
    // 创建 multer 上传器
    const upload = getUploadModel({
      maxSize: global.feConfigs?.uploadFileMaxSize
    });
    // 执行文件上传
    const { file, bucketName, metadata, data } = await upload.doUpload<
      UploadChatFileProps | UploadDatasetFileProps
    >(req, res);
    filePaths.push(file.path);

    // 根据 bucketName 进行权限认证
    const { teamId, uid } = await (async () => {
      if (bucketName === 'chat') {
        const chatData = data as UploadChatFileProps;
        const authData = await authChatCrud({
          req,
          authToken: true,
          authApiKey: true,
          ...chatData
        });
        return {
          teamId: authData.teamId,
          uid: authData.uid
        };
      }
      if (bucketName === 'dataset') {
        const chatData = data as UploadDatasetFileProps;
        const authData = await authDataset({
          datasetId: chatData.datasetId,
          per: WritePermissionVal,
          req,
          authToken: true,
          authApiKey: true
        });
        return {
          teamId: authData.teamId,
          uid: authData.tmbId
        };
      }
      return Promise.reject('bucketName is empty');
    })();

    // 认证上传限制
    await authUploadLimit(uid);

    // 添加上传成功日志
    addLog.info(`Upload file success ${file.originalname}, cost ${Date.now() - start}ms`);

    // 如果 bucketName 为空，抛出错误
    if (!bucketName) {
      throw new Error('bucketName is empty');
    }

    // 上传文件到数据库
    const fileId = await uploadFile({
      teamId,
      uid,
      bucketName,
      path: file.path,
      filename: file.originalname,
      contentType: file.mimetype,
      metadata: metadata
    });

    // 返回 JSON 响应，包含文件 ID 和预览 URL
    jsonRes(res, {
      data: {
        fileId,
        previewUrl: `${ReadFileBaseUrl}/${file.originalname}?token=${await createFileToken({
          bucketName,
          teamId,
          uid,
          fileId
        })}`
      }
    });
  } catch (error) {
    // 捕获错误并返回 JSON 响应
    jsonRes(res, {
      code: 500,
      error
    });
  }

  // 删除上传的文件路径
  // removeFilesByPaths(filePaths);
}

// 导出默认的 API 处理函数
export default NextAPI(handler);

// 配置 API，不使用 bodyParser
export const config = {
  api: {
    bodyParser: false
  }
};
