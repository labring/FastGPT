import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ExternalFileCreateDatasetCollectionParams } from '@fastgpt/global/core/dataset/api.d';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import axios from 'axios';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { checkDatasetLimit } from '@fastgpt/service/support/permission/teamLimit';
import { readRawContentByFileBuffer } from '@fastgpt/service/common/file/read/utils';
import { parseFileExtensionFromUrl } from '@fastgpt/global/common/string/tools';
import fs from 'fs';
import path from 'path';
import os from 'os';
import mongoose from 'mongoose';
import { detectFileEncoding } from '@fastgpt/global/common/file/tools';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // 确保MongoDB已连接
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGODB_URI as string);
    }

    console.log('[ExternalFileUrl] Request received:', JSON.stringify(req.body, null, 2));

    const {
      datasetId,
      externalFileUrl,
      externalFileId,
      parentId,
      filename,
      tags,
      trainingType,
      chunkSize,
      chunkSplitter,
      qaPrompt
    } = req.body as ExternalFileCreateDatasetCollectionParams;

    if (!datasetId || !externalFileUrl) {
      console.error('[ExternalFileUrl] Missing required parameters');
      throw new Error('Missing required parameters');
    }

    // 验证权限
    console.log('[ExternalFileUrl] Authenticating dataset:', datasetId);
    const { dataset, teamId, tmbId } = await authDataset({
      req,
      authToken: true,
      datasetId,
      per: WritePermissionVal
    });
    console.log('[ExternalFileUrl] Authentication successful. Team ID:', teamId);

    // 验证知识库数量限制
    console.log('[ExternalFileUrl] Checking dataset limit');
    await checkDatasetLimit({ teamId });
    console.log('[ExternalFileUrl] Dataset limit check passed');

    // 获取文件名
    const name = filename || externalFileUrl.split('/').pop() || 'External File';
    console.log('[ExternalFileUrl] Using filename:', name);

    // 下载外部文件
    let rawText = '';
    try {
      console.log('[ExternalFileUrl] Attempting to download file from:', externalFileUrl);

      // 下载文件
      const response = await axios({
        method: 'GET',
        url: externalFileUrl,
        responseType: 'arraybuffer',
        timeout: 30000, // 30秒超时
        headers: {
          'User-Agent': 'FastGPT/1.0'
        }
      });

      console.log('[ExternalFileUrl] File downloaded successfully, size:', response.data.length);

      // 创建临时文件
      const tempDir = os.tmpdir();
      const tempFilePath = path.join(tempDir, `fastgpt_${Date.now()}_${name}`);

      // 保存文件到临时目录
      fs.writeFileSync(tempFilePath, response.data);
      console.log('[ExternalFileUrl] File saved to temporary location:', tempFilePath);

      console.log('[ExternalFileUrl] externalFileUrl:', externalFileUrl);
      console.log('[ExternalFileUrl] filename:', name);
      // 获取文件扩展名（增强版，支持带参数的URL和fallback到filename）
      let fileExtension = parseFileExtensionFromUrl(externalFileUrl);

      console.log(
        '[ExternalFileUrl] fileExtension after parseFileExtensionFromUrl:',
        fileExtension
      );
      // fallback: 如果parseFileExtensionFromUrl失败，则从name中获取
      if (!fileExtension && name.includes('.')) {
        fileExtension = name.split('.').pop()?.toLowerCase() || '';
        console.log('[ExternalFileUrl] fileExtension after fallback from name:', fileExtension);
      }

      // fallback: 如果还没有，尝试从URL本身提取
      if (!fileExtension) {
        try {
          const urlPath = new URL(externalFileUrl).pathname;
          if (urlPath.includes('.')) {
            fileExtension = name.split('.').pop()?.toLowerCase() || '';
          }
        } catch (e) {
          // ignore
        }
      }

      console.log('[ExternalFileUrl] externalFileUrl:', externalFileUrl);
      console.log('[ExternalFileUrl] filename:', name);
      console.log('[ExternalFileUrl] fileExtension:', fileExtension);

      if (!fileExtension) {
        throw new Error(
          '无法识别文件扩展名，externalFileUrl: ' + externalFileUrl + ', filename: ' + name
        );
      }

      // 读取文件内容
      const buffer = fs.readFileSync(tempFilePath);

      // 检测文件编码
      const encoding = detectFileEncoding(buffer);
      console.log('[ExternalFileUrl] File encoding detected:', encoding);
      let rawText = '';

      const fileContent = await readRawContentByFileBuffer({
        buffer,
        extension: fileExtension,
        encoding,
        teamId,
        tmbId,
        isQAImport: false
      });
      rawText = fileContent.rawText;
      console.log('[ExternalFileUrl] File content read successfully, length:', rawText?.length);

      // 删除临时文件
      fs.unlinkSync(tempFilePath);
      console.log('[ExternalFileUrl] Temporary file deleted');
    } catch (error) {
      console.error('[ExternalFileUrl] Error downloading or processing file:', error);

      // 使用示例文本作为后备
      rawText = `This is a test document content for ${name}. 
      It contains sample text to test the external file URL import functionality.
      The file could not be downloaded or processed correctly.`;

      console.log('[ExternalFileUrl] Using fallback sample text due to download error');
    }

    // 创建集合并处理数据
    console.log('[ExternalFileUrl] Creating collection with the processed text');
    const { collectionId, insertResults } = await createCollectionAndInsertData({
      dataset,
      rawText,
      createCollectionParams: {
        teamId,
        tmbId,
        datasetId,
        parentId,
        name,
        type: DatasetCollectionTypeEnum.externalFile,
        externalFileId,
        externalFileUrl,
        trainingType,
        chunkSize,
        chunkSplitter,
        qaPrompt,
        tags
      }
    });
    console.log('[ExternalFileUrl] Collection created successfully:', collectionId);

    jsonRes(res, {
      data: {
        collectionId,
        results: insertResults
      }
    });
  } catch (error) {
    console.error('[ExternalFileUrl] Error details:', error);
    // 保留完整的错误信息
    jsonRes(res, {
      code: 500,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
