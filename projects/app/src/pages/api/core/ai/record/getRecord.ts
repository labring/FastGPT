import type { ApiRequestProps } from '@fastgpt/service/type/next';
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
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

export type GetRecordQuery = {
  requestId: string;
};

export type GetRecordBody = Record<string, never>;

export type GetRecordResponse = LLMRequestRecordSchemaType;

async function handler(req: ApiRequestProps): Promise<GetRecordResponse | undefined> {
  const { tmbId } = await authCert({ req, authToken: true });

  await authFrequencyLimit({
    eventId: `${tmbId}-getrecords`,
    maxAmount: 60,
    expiredTime: addSeconds(new Date(), 60)
  }).catch(() => {
    return Promise.reject('Frequency limit exceeded');
  });

  const { requestId } = parseApiInput({
    req,
    querySchema: GetLLMRequestRecordParamsSchema
  }).query;

  const record = await getLLMRequestRecord(requestId);

  if (!record) {
    return Promise.reject(i18nT('common:error.llm_track_expired'));
  }

  return LLMRequestRecordSchema.parse({
    ...record,
    _id: String(record._id)
  });
}

export default NextAPI(handler);
