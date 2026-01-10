import type { UserAuthTypeEnum } from '@fastgpt/global/support/user/auth/constants';
import { MongoUserAuth } from './schema';
import { i18nT } from '../../../../web/i18n/utils';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { UserError } from '@fastgpt/global/common/error/utils';

export const addAuthCode = async ({
  key,
  code,
  openid,
  type,
  expiredTime
}: {
  key: string;
  code?: string;
  openid?: string;
  type: `${UserAuthTypeEnum}`;
  expiredTime?: Date;
}) => {
  return MongoUserAuth.updateOne(
    {
      key,
      type
    },
    {
      code,
      openid,
      expiredTime
    },
    {
      upsert: true
    }
  );
};

export const authCode = async ({
  key,
  type,
  code
}: {
  key: string;
  type: `${UserAuthTypeEnum}`;
  code: string;
}) => {
  return mongoSessionRun(async (session) => {
    const result = await MongoUserAuth.findOne(
      {
        key,
        type,
        code: { $regex: new RegExp(`^${code}$`, 'i') }
      },
      undefined,
      { session }
    );

    if (!result) {
      return Promise.reject(new UserError(i18nT('common:error.code_error')));
    }

    setTimeout(async () => {
      await result.deleteOne({ session }).catch();
    }, 60000);

    return 'SUCCESS';
  });
};
