import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';

export type demoQuery = {};

export type demoBody = {};

export type demoResponse = {};

async function handler(
  req: ApiRequestProps<demoBody, demoQuery>,
  res: ApiResponseType<any>
): Promise<demoResponse> {
  return {};
}

export default NextAPI(handler);
