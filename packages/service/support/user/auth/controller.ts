import { UserAuthTypeEnum } from '@fastgpt/global/support/user/auth/constants';
import { MongoUserAuth } from './schema';
import { i18nT } from '../../../../web/i18n/utils';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { UserError } from '@fastgpt/global/common/error/utils';
import { z } from 'zod';

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

const authCodeSchema = z.object({
  key: z.string(),
  type: z.enum(UserAuthTypeEnum),
  code: z.string()
});
export const authCode = async (props: z.infer<typeof authCodeSchema>) => {
  const { key, type, code } = authCodeSchema.parse(props);
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

    await result.deleteOne();

    return 'SUCCESS';
  });
};
