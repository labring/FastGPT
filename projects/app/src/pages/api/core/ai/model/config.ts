import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authModelManage } from '@fastgpt/service/support/permission/model/controller';
import {
  getSystemModelConfigService,
  getTeamModelListService
} from '@fastgpt/service/core/ai/model/query';
import {
  GetModelConfigQuerySchema,
  GetModelConfigResponseSchema,
  type GetModelConfigQuery,
  type GetModelConfigResponse
} from '@fastgpt/global/openapi/core/ai/model/api';

/** 按显式作用域返回模型管理配置，避免公开目录接口承担多种响应形态。 */
async function handler(
  req: ApiRequestProps<Record<string, never>, GetModelConfigQuery>
): Promise<GetModelConfigResponse> {
  const { channelType } = parseApiInput({ req, querySchema: GetModelConfigQuerySchema }).query;
  const { tmbId } = await authModelManage({ req, channelType });

  return GetModelConfigResponseSchema.parse(
    channelType === 'system'
      ? await getSystemModelConfigService()
      : await getTeamModelListService({ tmbId })
  );
}

export default NextAPI(handler);
