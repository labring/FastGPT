import { PRICE_SCALE } from '@fastgpt/common/bill/constants';
import { IpLimit } from '@/service/common/ipLimit/schema';
import { authBalanceByUid, AuthUserTypeEnum } from '@/service/utils/auth';
import { OutLinkSchema } from '@/types/support/outLink';
import { OutLink } from './schema';
import axios from 'axios';

type AuthLinkProps = { ip?: string | null; authToken?: string; question: string };

export async function authOutLinkChat({
  shareId,
  ip,
  authToken,
  question
}: AuthLinkProps & {
  shareId: string;
}) {
  // get outLink
  const outLink = await OutLink.findOne({
    shareId
  });

  if (!outLink) {
    return Promise.reject('分享链接无效');
  }

  const uid = String(outLink.userId);

  const [user] = await Promise.all([
    authBalanceByUid(uid), // authBalance
    ...(global.feConfigs?.isPlus ? [authOutLinkLimit({ outLink, ip, authToken, question })] : []) // limit auth
  ]);

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
  ip,
  authToken,
  question
}: AuthLinkProps & {
  outLink: OutLinkSchema;
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

  // ip limit
  await (async () => {
    if (!outLink.limit) {
      return;
    }
    try {
      const ipLimit = await IpLimit.findOne({ ip, eventId: outLink._id });

      // first request
      if (!ipLimit) {
        return await IpLimit.create({
          eventId: outLink._id,
          ip,
          account: outLink.limit.QPM - 1
        });
      }

      // over one minute
      const diffTime = Date.now() - ipLimit.lastMinute.getTime();
      if (diffTime >= 60 * 1000) {
        ipLimit.account = outLink.limit.QPM - 1;
        ipLimit.lastMinute = new Date();
        return await ipLimit.save();
      }

      // over limit
      if (ipLimit.account <= 0) {
        return Promise.reject(
          `每分钟仅能请求 ${outLink.limit.QPM} 次, ${60 - Math.round(diffTime / 1000)}s 后重试~`
        );
      }

      // update limit
      ipLimit.account = ipLimit.account - 1;
      await ipLimit.save();
    } catch (error) {}
  })();

  // url auth. send request
  await authShareStart({ authToken, tokenUrl: outLink.limit.hookUrl, question });
}

type TokenAuthResponseType = {
  success: boolean;
  message?: string;
};

export const authShareChatInit = async (authToken?: string, tokenUrl?: string) => {
  if (!tokenUrl || !global.feConfigs?.isPlus) return;
  try {
    const { data } = await axios<TokenAuthResponseType>({
      baseURL: tokenUrl,
      url: '/shareAuth/init',
      method: 'POST',
      data: {
        token: authToken
      }
    });
    if (data?.success !== true) {
      return Promise.reject(data?.message || '身份校验失败');
    }
  } catch (error) {
    return Promise.reject('身份校验失败');
  }
};

export const authShareStart = async ({
  tokenUrl,
  authToken,
  question
}: {
  authToken?: string;
  question: string;
  tokenUrl?: string;
}) => {
  if (!tokenUrl || !global.feConfigs?.isPlus) return;
  try {
    const { data } = await axios<TokenAuthResponseType>({
      baseURL: tokenUrl,
      url: '/shareAuth/start',
      method: 'POST',
      data: {
        token: authToken,
        question
      }
    });

    if (data?.success !== true) {
      return Promise.reject(data?.message || '身份校验失败');
    }
  } catch (error) {
    return Promise.reject('身份校验失败');
  }
};
