import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { ModerationResultSchema } from '@fastgpt/global/sdk/fastgpt-plugin';
import {
  RawModerationCheckBodySchema,
  type RawModerationCheckBodyType,
  type RawModerationCheckResponseType
} from '@fastgpt/global/openapi/core/plugin/admin/moderation/api';
import { checkModerationForTest } from '@fastgpt/service/core/plugin/moderation/service';

export type AdminModerationCheckQuery = Record<string, never>;
export type AdminModerationCheckBody = RawModerationCheckBodyType;
export type AdminModerationCheckResponse = RawModerationCheckResponseType;

/**
 * 管理员测试调用审查插件。
 *
 * 两类失败必须区分：
 * - 框架级失败（插件不存在 / 进程崩溃）→ 抛错，由统一错误中间件返回可读错误
 * - provider 无法判定 → 正常响应，`verdict === 'error'` 并在 `errorMessage` 说明原因
 *
 * 待审文本与配置值不得写入日志：文本可能是用户隐私，配置值含凭据。
 */
export async function handler(
  req: ApiRequestProps<AdminModerationCheckBody, AdminModerationCheckQuery>,
  _res: ApiResponseType<any>
): Promise<AdminModerationCheckResponse> {
  await authSystemAdmin({ req });

  const { pluginId, version, secrets, input } = parseApiInput({
    req,
    bodySchema: RawModerationCheckBodySchema
  }).body;

  const result = await checkModerationForTest({
    pluginId,
    version,
    secrets,
    input,
    lang: getLocale(req)
  });

  return ModerationResultSchema.parse(result);
}

export default NextAPI(handler);
