import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import {
  GetModelStatusResponseSchema,
  type GetModelStatusResponse
} from '@fastgpt/global/openapi/admin/system/model/status';
import { getModelStatus } from '@fastgpt/service/core/ai/modelStatus/service';

/**
 * 管理员获取系统所有启用模型的探测状态及 48 小时监控时间线。
 * 包含当前生效的探测配置、模型健康概览统计（正常/高延迟/异常数）及按模型分组的时间线详情。
 */
async function handler(req: ApiRequestProps): Promise<GetModelStatusResponse> {
  await authSystemAdmin({ req });
  return GetModelStatusResponseSchema.parse(await getModelStatus());
}

export default NextAPI(handler);
