import type { UserAuthTypeEnum } from './constants';
import { MongoUserAuth } from './schema';
import { i18nT } from '../../../../web/i18n/utils';

export const authCode = async ({
  username,
  type,
  code
}: {
  username: string;
  type: `${UserAuthTypeEnum}`;
  code: string;
}) => {
  const result = await MongoUserAuth.findOne({
    key: username,
    type,
    code: code.toLowerCase()
  });

  if (!result) {
    return Promise.reject(i18nT('common:error.code_error'));
  }

  return 'SUCCESS';
};
