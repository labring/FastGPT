import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import {
  FileServiceHealthResponseSchema,
  type FileServiceHealthResponse
} from '@fastgpt/global/openapi/admin/system/instanceConfig/probe';

/** 独立域名可公开探测文件路由，响应不携带实例信息或文件内容。 */
async function handler(
  _req: ApiRequestProps,
  res: ApiResponseType
): Promise<FileServiceHealthResponse> {
  res.setHeader('Cache-Control', 'no-store');
  return FileServiceHealthResponseSchema.parse({ service: 'fastgpt-file-service' });
}

export default NextAPI(handler, { csrf: false });
