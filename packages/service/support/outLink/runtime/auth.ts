import { authFrequencyLimit } from '../../../common/system/frequencyLimit/utils';
import type {
  AuthOutLinkInitProps,
  AuthOutLinkLimitProps,
  AuthOutLinkResponse
} from '@fastgpt/global/support/outLink/api';
import { axios } from '../../../common/api/axios';
import { OutLinkErrEnum } from '@fastgpt/global/common/error/code/outLink';
import type { OutLinkSchema } from '@fastgpt/global/support/outLink/type';
import { addMinutes } from 'date-fns';
import { S3_KEY_PATH_INVALID_CHARS } from '../../../common/s3/constants';
import { UserError } from '@fastgpt/global/common/error/utils';

export type TokenAuthResponseType = {
  success: boolean;
  msg?: string;
  message?: string;
  data?: AuthOutLinkResponse;
};

export const authOutLinkInit = async ({
  tokenUrl,
  outLinkUid
}: AuthOutLinkInitProps): Promise<AuthOutLinkResponse> => {
  if (!tokenUrl) return { uid: outLinkUid };

  const { data } = await axios<TokenAuthResponseType>({
    baseURL: tokenUrl,
    url: '/shareAuth/init',
    method: 'POST',
    data: {
      token: outLinkUid
    }
  });
  if (data?.success !== true) {
    return Promise.reject(data?.message || data?.msg || OutLinkErrEnum.unAuthUser);
  }

  const uid = data?.data?.uid;
  if (
    !uid ||
    typeof uid !== 'string' ||
    Buffer.byteLength(uid) > 255 ||
    S3_KEY_PATH_INVALID_CHARS.test(uid)
  ) {
    return Promise.reject(new UserError('Invalid UID'));
  }

  return { uid };
};

const authIpLimit = async ({ ip, outLink }: { ip: string; outLink: OutLinkSchema }) => {
  if (!outLink.limit || !outLink.limit.QPM) {
    return;
  }

  try {
    await authFrequencyLimit({
      eventId: `${outLink._id}-${ip}`,
      maxAmount: outLink.limit.QPM,
      expiredTime: addMinutes(new Date(), 1)
    });
  } catch (error) {
    return Promise.reject(new UserError(`每分钟仅能请求 ${outLink.limit.QPM} 次~`));
  }
};

export async function authOutLinkLimit({
  outLink,
  ip,
  outLinkUid,
  question
}: AuthOutLinkLimitProps): Promise<AuthOutLinkResponse> {
  if (!outLink.limit) {
    return { uid: outLinkUid };
  }

  //   expiredTime already to string
  if (outLink.limit.expiredTime && new Date(outLink.limit.expiredTime).getTime() < Date.now()) {
    return Promise.reject(new UserError('分享链接已过期'));
  }

  if (
    outLink.limit.maxUsagePoints &&
    outLink.limit.maxUsagePoints > -1 &&
    outLink.usagePoints > outLink.limit.maxUsagePoints
  ) {
    return Promise.reject(new UserError('链接超出使用限制'));
  }

  // ip limit
  if (ip) {
    await authIpLimit({ ip, outLink });
  }

  // url auth. send request
  if (!outLink.limit.hookUrl) {
    return { uid: outLinkUid };
  }
  try {
    const { data } = await axios<TokenAuthResponseType>({
      baseURL: outLink.limit.hookUrl,
      url: '/shareAuth/start',
      method: 'POST',
      data: {
        token: outLinkUid,
        question
      }
    });

    if (data?.success !== true) {
      return Promise.reject(new UserError(data?.message || data?.msg || '身份校验失败'));
    }

    return { uid: data?.data?.uid || outLinkUid };
  } catch (error) {
    return Promise.reject(new UserError('身份校验失败'));
  }
}
