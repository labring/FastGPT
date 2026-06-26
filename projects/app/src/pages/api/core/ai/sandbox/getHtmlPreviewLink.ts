import type { NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import {
  authSandboxSession,
  buildSandboxClientQueryFromChatSource
} from '@/service/core/sandbox/auth';
import { SandboxGetHtmlPreviewLinkBodySchema } from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { S3PrivateBucket } from '@fastgpt/service/common/s3/buckets/private';
import { getFileS3Key } from '@fastgpt/service/common/s3/utils';
import { addMinutes } from 'date-fns';
import { getSandboxClient } from '@fastgpt/service/core/ai/sandbox/service/runtime';
import { getSandboxFileContent } from '@/service/core/sandbox/fileService';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(req: ApiRequestProps, res: NextApiResponse): Promise<void> {
  const { sourceType, sourceId, chatId, filePath, outLinkAuthData } = parseApiInput({
    req,
    bodySchema: SandboxGetHtmlPreviewLinkBodySchema
  }).body;

  // 1. 鉴权
  const { uid, teamId } = await authSandboxSession({
    req,
    sourceType,
    sourceId,
    chatId,
    outLinkAuthData
  });

  // 2. 从沙箱读取实际文件内容，避免客户端传入任意 HTML
  const sandbox = await getSandboxClient(
    buildSandboxClientQueryFromChatSource({
      sourceType,
      sourceId,
      userId: uid,
      chatId
    })
  );
  const { content, contentType } = await getSandboxFileContent(sandbox, filePath, true);

  if (!contentType.startsWith('text/html')) {
    return jsonRes(res, { code: 400, message: 'File is not an HTML file' });
  }

  // 3. 保持 HTML 原始内容上传到 S3，避免预览时移除或禁用脚本逻辑。
  const bucket = new S3PrivateBucket();
  const { fileKey } = getFileS3Key.temp({ teamId, filename: 'preview.html' });
  const expiredTime = addMinutes(new Date(), 30);

  const {
    accessUrl: { url }
  } = await bucket.uploadFileByBody({
    key: fileKey,
    body: content,
    filename: 'preview.html',
    contentType: 'text/html; charset=utf-8',
    expiredTime
  });

  return jsonRes(res, {
    data: url
  });
}

export default NextAPI(handler);
