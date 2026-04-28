/**
 * 返回系统工具的详细信息，用于展示
 */
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import {
  ToolDetailBodySchema,
  ToolDetailQuerySchema,
  ToolDetailResponseSchema
} from '@fastgpt/global/openapi/core/app/tool/detail/dto';
import type {
  ToolDetailBodyType,
  ToolDetailQueryType,
  ToolDetailResponseType
} from '@fastgpt/global/openapi/core/app/tool/detail/dto';
import { z } from 'zod';

async function handler(
  req: ApiRequestProps<ToolDetailBodyType, ToolDetailQueryType>,
  res: ApiResponseType<ToolDetailResponseType>
): Promise<ToolDetailResponseType> {
  const body = ToolDetailBodySchema.parse(req.body);
  const query = ToolDetailQuerySchema.parse(req.query);

  return {};
}

export default NextAPI(handler);
