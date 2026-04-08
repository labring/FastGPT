import type { NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { z } from 'zod';
import { OutLinkChatAuthSchema } from '@fastgpt/global/support/permission/chat';
import { S3PrivateBucket } from '@fastgpt/service/common/s3/buckets/private';
import { getFileS3Key } from '@fastgpt/service/common/s3/utils';
import { addMinutes } from 'date-fns';

const GetHtmlPreviewLinkBodySchema = z.object({
  appId: z.string(),
  chatId: z.string(),
  content: z.string(),
  outLinkAuthData: OutLinkChatAuthSchema.optional()
});

async function handler(req: ApiRequestProps, res: NextApiResponse): Promise<void> {
  const { appId, chatId, content, outLinkAuthData } = GetHtmlPreviewLinkBodySchema.parse(req.body);

  // 1. Auth check
  const { teamId } = await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    appId,
    chatId,
    ...outLinkAuthData
  });

  // 2. Upload to S3
  const bucket = new S3PrivateBucket();
  const filename = `preview-${Date.now()}.html`;
  const { fileKey } = getFileS3Key.temp({ teamId, filename });
  const expiredTime = addMinutes(new Date(), 30);

  const {
    accessUrl: { url }
  } = await bucket.uploadFileByBody({
    key: fileKey,
    body: Buffer.from(content, 'utf-8'),
    filename,
    contentType: 'text/html; charset=utf-8',
    expiredTime
  });

  return jsonRes(res, {
    data: url
  });
}

export default NextAPI(handler);
