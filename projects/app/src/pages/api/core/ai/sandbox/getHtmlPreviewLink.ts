import type { NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { SandboxGetHtmlPreviewLinkBodySchema } from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { S3PrivateBucket } from '@fastgpt/service/common/s3/buckets/private';
import { getFileS3Key } from '@fastgpt/service/common/s3/utils';
import { addMinutes } from 'date-fns';
import { getSandboxClient } from '@fastgpt/service/core/ai/sandbox/controller';
import { getSandboxFileContent } from '@/service/core/sandbox/fileService';

// 在 <head> 中注入 CSP，禁止外部脚本加载，仅允许 inline（沙箱预览场景）
function injectCspMetaTag(html: string): string {
  const cspMeta =
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self' data: blob:; script-src 'none'; style-src 'unsafe-inline' 'self' data:;\">";

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/(<head[^>]*>)/i, `$1${cspMeta}`);
  }
  // 没有 <head> 标签时，直接前置
  return cspMeta + html;
}

async function handler(req: ApiRequestProps, res: NextApiResponse): Promise<void> {
  const { appId, chatId, filePath, outLinkAuthData } = SandboxGetHtmlPreviewLinkBodySchema.parse(
    req.body
  );

  // 1. 鉴权
  const { teamId, uid } = await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    appId,
    chatId,
    ...outLinkAuthData
  });

  // 2. 从沙箱读取实际文件内容，避免客户端传入任意 HTML
  const sandbox = await getSandboxClient({ appId, userId: uid, chatId });
  await sandbox.ensureAvailable();

  const { content, contentType } = await getSandboxFileContent(sandbox, filePath, true);

  if (!contentType.startsWith('text/html')) {
    return jsonRes(res, { code: 400, message: 'File is not an HTML file' });
  }

  // 3. 注入 CSP meta tag 后上传到 S3
  const safeHtml = injectCspMetaTag(content.toString('utf-8'));
  const bucket = new S3PrivateBucket();
  const { fileKey } = getFileS3Key.temp({ teamId, filename: 'preview.html' });
  const expiredTime = addMinutes(new Date(), 30);

  const {
    accessUrl: { url }
  } = await bucket.uploadFileByBody({
    key: fileKey,
    body: Buffer.from(safeHtml, 'utf-8'),
    filename: 'preview.html',
    contentType: 'text/html; charset=utf-8',
    expiredTime
  });

  return jsonRes(res, {
    data: url
  });
}

export default NextAPI(handler);
