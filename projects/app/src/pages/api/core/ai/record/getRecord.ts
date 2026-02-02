import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type { LLMRequestRecordSchemaType } from '@fastgpt/global/openapi/core/ai/api';
import { getLLMRequestRecord } from '@fastgpt/service/core/ai/record/controller';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import {
  GetLLMRequestRecordParamsSchema,
  LLMRequestRecordSchema
} from '@fastgpt/global/openapi/core/ai/api';
import { addSeconds } from 'date-fns';
import { authFrequencyLimit } from '@fastgpt/service/common/system/frequencyLimit/utils';

export type GetRecordQuery = {
  requestId: string;
};

export type GetRecordBody = {};

export type GetRecordResponse = LLMRequestRecordSchemaType;

async function handler(
  req: ApiRequestProps,
  res: ApiResponseType
): Promise<GetRecordResponse | undefined> {
  const { tmbId } = await authCert({ req, authToken: true });

  await authFrequencyLimit({
    eventId: `${tmbId}-getrecords`,
    maxAmount: 60,
    expiredTime: addSeconds(new Date(), 60)
  }).catch((err) => {
    return Promise.reject('Frequency limit exceeded');
  });

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
