import { MongoTmpData } from '../../../tmpData/schema';
import { getDataId } from '../../../tmpData/verification';
import type { ClientSession } from '../../../../common/mongo';
import type {
  CaptchaVerificationPurpose,
  VerificationMaterial
} from '@fastgpt/global/support/user/account/verification/type';
import { CAPTCHA_MAX_ATTEMPTS } from '@fastgpt/global/support/user/account/captcha/constants';

/**
 * 为有效图片原子预占一次校验机会，返回递增后的材料；过期、已消费或次数用尽时返回 null。
 * 条件与递增在一次 Mongo 写入中完成，防止并发请求突破每张图三次的上限；保留原始过期时间。
 */
export const claimCaptchaAttempt = async (
  { challengeId, purpose }: { challengeId: string; purpose: CaptchaVerificationPurpose },
  session?: ClientSession
): Promise<VerificationMaterial<'puzzle'> | null> => {
  const record = await MongoTmpData.findOneAndUpdate(
    {
      dataId: getDataId({ type: 'puzzle', scene: purpose, key: challengeId }),
      expireAt: { $gt: new Date() },
      'data.attempts': { $lt: CAPTCHA_MAX_ATTEMPTS }
    },
    { $inc: { 'data.attempts': 1 } },
    { new: true, ...(session ? { session } : {}) }
  ).lean();

  // tmp_datas 的 data 为通用载荷，精确 dataId 已将材料收窄到当前旋转挑战。
  return record ? (record.data as VerificationMaterial<'puzzle'>) : null;
};
