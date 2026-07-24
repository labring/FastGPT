import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import {
  PreLoginQuerySchema,
  type PreLoginQueryType,
  type PreLoginResponseType
} from '@fastgpt/global/openapi/support/user/account/login/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { passwordAccountVerification } from '@fastgpt/service/support/user/account/verification/password/service';
import { useIPFrequencyLimit } from '@fastgpt/service/common/middle/reqFrequencyLimit';
import { authFrequencyLimit } from '@fastgpt/service/common/system/frequencyLimit/utils';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { addMinutes } from 'date-fns';

async function handler(
  req: ApiRequestProps<Record<string, never>, PreLoginQueryType>
): Promise<PreLoginResponseType> {
  const { username } = parseApiInput({ req, querySchema: PreLoginQuerySchema }).query;
  await authFrequencyLimit({
    eventId: `pre-login-username-${hashStr(username)}`,
    maxAmount: 10,
    expiredTime: addMinutes(new Date(), 1)
  });
  return passwordAccountVerification.create({ username });
}

export default NextAPI(
  useIPFrequencyLimit({ id: 'pre-login', seconds: 60, limit: 60, force: true }),
  handler
);
