import type { ApiRequestProps } from '@fastgpt/next/type';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { startTrainingQueue } from '@/service/core/dataset/training/utils';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  UnlockSystemTaskQuerySchema,
  UnlockSystemTaskResponseSchema,
  type UnlockSystemTaskResponse
} from '@fastgpt/global/openapi/common/system/api';

async function handler(req: ApiRequestProps): Promise<UnlockSystemTaskResponse> {
  parseApiInput({ req, querySchema: UnlockSystemTaskQuerySchema });

  try {
    await authCert({ req, authToken: true });
    startTrainingQueue();
  } catch (error) {}

  return UnlockSystemTaskResponseSchema.parse(undefined);
}

export default NextAPI(handler);
