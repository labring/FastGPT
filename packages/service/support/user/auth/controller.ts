import { UserAuthTypeEnum } from '@fastgpt/global/support/user/auth/constants';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { MongoAccountVerificationMaterial } from '../account/verification/schema';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { UserError } from '@fastgpt/global/common/error/utils';
import { z } from 'zod';
import { assertCodeVerificationConsumeFrequency } from '../account/verification/utils';
import { addMinutes } from 'date-fns';

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
  const createTime = new Date();
  return MongoAccountVerificationMaterial.updateOne(
    {
      key,
      type
    },
    {
      $set: {
        code,
        openid,
        createTime,
        expiredTime: expiredTime ?? addMinutes(createTime, 5)
      }
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
  await assertCodeVerificationConsumeFrequency({ account: key, scene: type });

  return mongoSessionRun(async (session) => {
    const result = await MongoAccountVerificationMaterial.findOne(
      {
        key,
        type,
        code: { $regex: new RegExp(`^${code}$`, 'i') }
      },
      undefined,
      { session }
    );

    if (!result) {
      return Promise.reject(new UserError(UserErrEnum.invalidVerificationCode));
    }

    await result.deleteOne();

    return 'SUCCESS';
  });
};
