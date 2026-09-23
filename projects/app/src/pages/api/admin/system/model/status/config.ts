import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  ModelStatusProbeConfigResponseSchema,
  UpdateModelStatusProbeConfigBodySchema,
  type ModelStatusProbeConfigResponse,
  type UpdateModelStatusProbeConfigBody
} from '@fastgpt/global/openapi/admin/system/model/status';
import { updateModelStatusProbeConfig } from '@fastgpt/service/core/ai/modelStatus/service';

/**
 * 管理员修改系统模型探测配置 API。
 * 支持开启/关闭自动探测、设置探测周期（5-60 分钟）、配置告警 Webhook 地址及 Token。
 */
async function handler(
  req: ApiRequestProps<UpdateModelStatusProbeConfigBody>
): Promise<ModelStatusProbeConfigResponse> {
  await authSystemAdmin({ req });
  const body = parseApiInput({
    req,
    bodySchema: UpdateModelStatusProbeConfigBodySchema
  }).body;

  return ModelStatusProbeConfigResponseSchema.parse(await updateModelStatusProbeConfig(body));
}

export default NextAPI(handler);
