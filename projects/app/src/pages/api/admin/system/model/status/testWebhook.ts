import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  TestModelStatusWebhookBodySchema,
  TestModelStatusWebhookResponseSchema,
  type TestModelStatusWebhookBody,
  type TestModelStatusWebhookResponse
} from '@fastgpt/global/openapi/admin/system/model/status';
import { testModelStatusWebhook } from '@fastgpt/service/core/ai/modelStatus/service';

/**
 * 管理员测试系统模型状态告警 Webhook 连通性 API。
 * 会依次发送一条模拟失败消息（model_status_error）与一条模拟恢复消息（model_status_recovered）。
 */
async function handler(
  req: ApiRequestProps<TestModelStatusWebhookBody>
): Promise<TestModelStatusWebhookResponse> {
  await authSystemAdmin({ req });
  const body = parseApiInput({
    req,
    bodySchema: TestModelStatusWebhookBodySchema
  }).body;

  return TestModelStatusWebhookResponseSchema.parse(await testModelStatusWebhook(body));
}

export default NextAPI(handler);
