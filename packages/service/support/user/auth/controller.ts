import type { UserAuthTypeEnum } from '@fastgpt/global/support/user/auth/constants';
import { MongoUserAuth } from './schema';
import { i18nT } from '../../../../web/i18n/utils';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';

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
      return Promise.reject(i18nT('common:error.code_error'));
    }

    await result.deleteOne({ session });

    return 'SUCCESS';
  });
};
