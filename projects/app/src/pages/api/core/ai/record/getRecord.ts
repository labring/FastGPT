import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type { LLMRequestRecordSchemaType } from '@fastgpt/global/openapi/core/ai/api';
import { getLLMRequestRecord } from '@fastgpt/service/core/ai/record/controller';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import {
  GetLLMRequestRecordParamsSchema,
  LLMRequestRecordSchema
} from '@fastgpt/global/openapi/core/ai/api';
import { LimitTypeEnum, teamFrequencyLimit } from '@fastgpt/service/common/api/frequencyLimit';

export type GetRecordQuery = {
  requestId: string;
};

export type GetRecordBody = {};

export type GetRecordResponse = LLMRequestRecordSchemaType;

async function handler(
  req: ApiRequestProps,
  res: ApiResponseType
): Promise<GetRecordResponse | undefined> {
  const { teamId } = await authCert({ req, authToken: true });

  if (
    !(await teamFrequencyLimit({
      teamId,
      type: LimitTypeEnum.oneRequest,
      res
    }))
  ) {
    return;
  }

  const { requestId } = GetLLMRequestRecordParamsSchema.parse(req.query);

  if (!requestId) {
    return Promise.reject('requestId is required');
  }

  const record = await getLLMRequestRecord(requestId);

  if (!record) {
    return Promise.reject('Record not found');
  }

  return LLMRequestRecordSchema.parse({
    ...record,
    _id: String(record._id)
  });
}

export default NextAPI(handler);
