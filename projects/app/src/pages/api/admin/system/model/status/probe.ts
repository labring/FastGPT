import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import {
  RunModelStatusProbeResponseSchema,
  type RunModelStatusProbeResponse
} from '@fastgpt/global/openapi/admin/system/model/status';
import { runModelStatusProbe } from '@fastgpt/service/core/ai/modelStatus/service';

/**
 * 管理员手动立即触发一轮全量已启用模型的可用性探测。
 * 强制执行（即使定时任务配置为未开启），执行完成后返回所有探测记录并入库更新状态。
 */
async function handler(req: ApiRequestProps): Promise<RunModelStatusProbeResponse> {
  const { teamId } = await authSystemAdmin({ req });
  return RunModelStatusProbeResponseSchema.parse(
    await runModelStatusProbe({ teamId, force: true })
  );
}

export default NextAPI(handler);
