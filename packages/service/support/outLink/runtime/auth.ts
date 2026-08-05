import { assertOutLinkRateLimit } from '../../../common/rateLimit/interface/outLink';
import type {
  AuthOutLinkInitProps,
  AuthOutLinkLimitProps,
  AuthOutLinkResponse
} from '@fastgpt/global/support/outLink/api';
import { axios } from '../../../common/api/axios';
import { OutLinkErrEnum } from '@fastgpt/global/common/error/code/outLink';
import type { OutLinkSchemaType } from '@fastgpt/global/support/outLink/type';
import { UserError } from '@fastgpt/global/common/error/utils';
import { S3_KEY_PATH_INVALID_CHARS } from '../../../common/s3/config/constants';

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
    return Promise.reject(new UserError(data?.message || data?.msg || OutLinkErrEnum.unAuthUser));
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

const assertOutLinkQpmLimit = async (outLink: OutLinkSchemaType, uid: string) => {
  if (!outLink.limit || !outLink.limit.QPM) {
    return;
  }

  await assertOutLinkRateLimit({
    outLinkId: String(outLink._id),
    uid,
    limit: outLink.limit.QPM
  });
};

export async function authOutLinkLimit({
  outLink,
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

  await assertOutLinkQpmLimit(outLink, outLinkUid);

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
  } catch {
    return Promise.reject(new UserError('身份校验失败'));
  }
}
