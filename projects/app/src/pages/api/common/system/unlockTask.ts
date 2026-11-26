import type { ApiRequestProps } from '@fastgpt/next/type';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { resumeUnpaidDatasetTraining } from '@fastgpt/service/core/dataset/training/runtime';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  UnlockSystemTaskQuerySchema,
  UnlockSystemTaskResponseSchema,
  type UnlockSystemTaskResponse
} from '@fastgpt/global/openapi/common/system/api';

const logger = getLogger(LogCategories.MODULE.DATASET.TRAINING);

async function handler(req: ApiRequestProps): Promise<UnlockSystemTaskResponse> {
  parseApiInput({ req, querySchema: UnlockSystemTaskQuerySchema });

  try {
    const { teamId } = await authCert({ req, authToken: true });
    void resumeUnpaidDatasetTraining({ teamId: String(teamId), refreshBalance: true }).catch(
      (error) => logger.error('Failed to resume document training after unlock', { error })
    );
  } catch {
    // 沿用旧接口的空成功响应，鉴权失败时不触发恢复。
  }

  return UnlockSystemTaskResponseSchema.parse(undefined);
}

export default NextAPI(handler);
