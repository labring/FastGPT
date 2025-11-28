import { POST } from '@fastgpt/service/common/api/plusRequest';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';

export type OutLinkTuituiQuery = any;
export type OutLinkTuituiBody = any;
export type OutLinkTuituiResponse = {};

async function handler(
  req: ApiRequestProps<OutLinkTuituiBody, OutLinkTuituiQuery>,
  _res: ApiResponseType<unknown>
): Promise<unknown> {
  if (req.method === 'GET') {
    return {
      success: true
    };
  }
  // send to pro
  const { token } = req.query;
  const result = await POST<unknown>(`support/outLink/tuitui/${token}`, req.body, {
    headers: req.headers as unknown as Record<string, string>
  });

  return result;
}

export default NextAPI(handler);
