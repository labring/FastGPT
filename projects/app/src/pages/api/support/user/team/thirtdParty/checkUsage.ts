import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { axios } from '@fastgpt/service/common/api/axios';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import {
  CheckThirdPartyUsageQuerySchema,
  CheckThirdPartyUsageResponseSchema,
  type CheckThirdPartyUsageQuery,
  type CheckThirdPartyUsageResponse
} from '@fastgpt/global/openapi/common/other/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
const logger = getLogger(LogCategories.MODULE.USER.TEAM);

export type checkUsageQuery = CheckThirdPartyUsageQuery;

export type checkUsageBody = Record<string, never>;

export type checkUsageResponse = CheckThirdPartyUsageResponse;

async function handler(
  req: ApiRequestProps<checkUsageBody, checkUsageQuery>
): Promise<checkUsageResponse> {
  const { key } = parseApiInput({ req, querySchema: CheckThirdPartyUsageQuerySchema }).query;

  const usage = await (async () => {
    try {
      const { tmb } = await authUserPer({ req, authToken: true, per: ReadPermissionVal });

      const url = global.feConfigs.externalProviderWorkflowVariables?.find(
        (item) => item.key === key
      )?.url;
      if (!url || !tmb.externalWorkflowVariables?.[key]) return undefined;

      const { data } = await axios.get<checkUsageResponse>(url, {
        headers: {
          Authorization: `Bearer ${tmb.externalWorkflowVariables[key]}`
        }
      });

      if (!data) return undefined;

      return {
        total: data.total ?? 0,
        used: data.used ?? 0
      };
    } catch (error) {
      logger.debug('checkUsage error', { error });
    }
  })();

  return CheckThirdPartyUsageResponseSchema.parse(usage);
}

export default NextAPI(handler);
