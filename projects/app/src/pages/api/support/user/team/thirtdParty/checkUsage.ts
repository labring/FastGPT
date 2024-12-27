import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import axios from 'axios';
import { addLog } from '@fastgpt/service/common/system/log';

export type checkUsageQuery = { key: string };

export type checkUsageBody = {};

export type checkUsageResponse =
  | {
      total: number;
      used: number;
    }
  | undefined;

async function handler(
  req: ApiRequestProps<checkUsageBody, checkUsageQuery>,
  res: ApiResponseType<any>
): Promise<checkUsageResponse> {
  try {
    const { key } = req.query;

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
      total: data.total || 0,
      used: data.used || 0
    };
  } catch (error) {
    addLog.debug('checkUsage error', { error });
  }
}

export default NextAPI(handler);
