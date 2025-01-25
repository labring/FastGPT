import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { POST } from '@fastgpt/service/common/api/plusRequest';
import { NextAPI } from '@/service/middleware/entry';

export type OutLinkDingtalkQuery = any;
export type OutLinkDingtalkBody = any;
export type OutLinkFeishuResponse = {};

async function handler(
  req: ApiRequestProps<OutLinkDingtalkBody, OutLinkDingtalkQuery>,
  res: ApiResponseType<any>
): Promise<any> {
  if (req.method === 'GET') {
    return {
      success: true
    };
  }
  // send to pro
  const { token } = req.query;
  const result = await POST<any>(`support/outLink/dingtalk/${token}`, req.body, {
    headers: {
      timestamp: (req.headers.timestamp as string) ?? '',
      sign: (req.headers.sign as string) ?? ''
    }
  });

  return result;
}

export default NextAPI(handler);
