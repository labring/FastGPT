import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  RestoreModerationPluginBodySchema,
  type RestoreModerationPluginBodyType
} from '@fastgpt/global/openapi/core/plugin/admin/moderation/api';
import { restoreModerationPlugin } from '@fastgpt/service/core/plugin/moderation/service';

/** Restore an installed moderation plugin without enabling it or replacing saved credentials. */
export async function handler(
  req: ApiRequestProps<RestoreModerationPluginBodyType>
): Promise<void> {
  await authSystemAdmin({ req });
  const { body } = parseApiInput({ req, bodySchema: RestoreModerationPluginBodySchema });
  await restoreModerationPlugin(body);
}

export default NextAPI(handler);
