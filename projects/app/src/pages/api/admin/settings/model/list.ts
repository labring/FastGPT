import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import {
  GetAdminSystemModelListResponseSchema,
  type GetAdminSystemModelListResponse
} from '@fastgpt/global/openapi/admin/core/ai/model/api';
import { desensitizeSystemModel } from '@fastgpt/service/core/ai/config/utils';

async function handler(req: ApiRequestProps): Promise<GetAdminSystemModelListResponse> {
  await authSystemAdmin({ req });

  return GetAdminSystemModelListResponseSchema.parse({
    models: global.systemModelList.map(desensitizeSystemModel),
    providers: global.ModelProviderRawCache,
    defaultModelIds: global.systemConfiguredDefaultModelIds,
    aiproxyChannels: global.aiproxyChannelsCache
  });
}

export default NextAPI(handler);
