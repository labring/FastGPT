import { PRICE_SCALE } from '@/constants/common';
import { IpLimit } from '@/service/common/ipLimit/schema';
import { authBalanceByUid, AuthUserTypeEnum } from '@/service/utils/auth';
import { OutLinkSchema } from '@/types/support/outLink';
import { OutLink } from './schema';

export async function authOutLinkChat({ shareId, ip }: { shareId: string; ip?: string | null }) {
  // get outLink
  const outLink = await OutLink.findOne({
    shareId
  });

  if (!outLink) {
    return Promise.reject('分享链接无效');
  }

  const uid = String(outLink.userId);

  // authBalance
  const user = await authBalanceByUid(uid);

  // limit auth
  await authOutLinkLimit({ outLink, ip });

  return {
    user,
    userId: String(outLink.userId),
    appId: String(outLink.appId),
    authType: AuthUserTypeEnum.token,
    responseDetail: outLink.responseDetail
  };
}

export async function authOutLinkLimit({
  outLink,
  ip
}: {
  outLink: OutLinkSchema;
  ip?: string | null;
}) {
  if (!ip || !outLink.limit) {
    return;
  }

  if (outLink.limit.expiredTime && outLink.limit.expiredTime.getTime() < Date.now()) {
    return Promise.reject('分享链接已过期');
  }

  if (outLink.limit.credit > -1 && outLink.total > outLink.limit.credit * PRICE_SCALE) {
    return Promise.reject('链接超出使用限制');
  }

  const ipLimit = await IpLimit.findOne({ ip, eventId: outLink._id });

  try {
    if (!ipLimit) {
      await IpLimit.create({
        eventId: outLink._id,
        ip,
        account: outLink.limit.QPM - 1
      });
      return;
    }
    // over one minute
    const diffTime = Date.now() - ipLimit.lastMinute.getTime();
    if (diffTime >= 60 * 1000) {
      ipLimit.account = outLink.limit.QPM - 1;
      ipLimit.lastMinute = new Date();
      return await ipLimit.save();
    }
    if (ipLimit.account <= 0) {
      return Promise.reject(
        `每分钟仅能请求 ${outLink.limit.QPM} 次, ${60 - Math.round(diffTime / 1000)}s 后重试~`
      );
    }
    ipLimit.account = ipLimit.account - 1;
    await ipLimit.save();
  } catch (error) {}
}
