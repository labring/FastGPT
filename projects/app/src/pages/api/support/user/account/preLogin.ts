import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import {
  PreLoginQuerySchema,
  type PreLoginQueryType,
  type PreLoginResponseType
} from '@fastgpt/global/openapi/support/user/account/login/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { passwordVerificationService } from '@fastgpt/service/support/user/account/verification/password/service';

async function handler(
  req: ApiRequestProps<Record<string, never>, PreLoginQueryType>,
  _res: ApiResponseType<any>
): Promise<PreLoginResponseType> {
  const { username } = parseApiInput({ req, querySchema: PreLoginQuerySchema }).query;

  return passwordVerificationService.issuePreLoginCode({ username, purpose: 'login' });
}

export default NextAPI(handler);
