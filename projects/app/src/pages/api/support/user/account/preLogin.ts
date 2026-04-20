import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { UserAuthTypeEnum } from '@fastgpt/global/support/user/auth/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { addSeconds } from 'date-fns';
import { addAuthCode } from '@fastgpt/service/support/user/auth/controller';
import {
  PreLoginQuerySchema,
  type PreLoginQueryType,
  type PreLoginResponseType
} from '@fastgpt/global/openapi/support/user/account/login/api';

async function handler(
  req: ApiRequestProps<{}, PreLoginQueryType>,
  res: ApiResponseType<any>
): Promise<PreLoginResponseType> {
  const { username } = PreLoginQuerySchema.parse(req.query);

  const code = getNanoid(6);

  await addAuthCode({
    type: UserAuthTypeEnum.login,
    key: username,
    code,
    expiredTime: addSeconds(new Date(), 30)
  });

  return {
    code
  };
}

export default NextAPI(handler);
