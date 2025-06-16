import type { NextApiRequest, NextApiResponse } from 'next';
import type {
  AuthOutLinkLimitProps,
  AuthOutLinkResponse
} from '@fastgpt/global/support/outLink/api.d';
import { NextAPI } from '@/service/middleware/entry';
import { OutLinkErrEnum } from '@fastgpt/global/common/error/code/outLink';
import { getNanoid } from '@fastgpt/global/common/string/tools';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { outLink, ip, outLinkUid, question } = req.body as AuthOutLinkLimitProps;

    console.log('[DEBUG] chatStart - basic validation for outLinkUid:', outLinkUid);

    if (!outLink) {
      console.log('[ERROR] outLink is required');
      return res.status(400).json({ error: 'outLink is required' });
    }

    // 基本的使用限制检查（不涉及复杂鉴权）
    const { QPM = 1000, maxUsagePoints = -1, expiredTime } = outLink.limit || {};

    // 检查链接是否过期
    if (expiredTime && new Date(expiredTime).getTime() < Date.now()) {
      console.log('[WARN] Link expired');
      return res.status(403).json({
        error: OutLinkErrEnum.linkExpired,
        code: OutLinkErrEnum.linkExpired
      });
    }

    // 检查使用点数限制（如果设置了限制）
    if (maxUsagePoints > 0 && outLink.usagePoints >= maxUsagePoints) {
      console.log('[WARN] Usage points exceeded');
      return res.status(403).json({
        error: OutLinkErrEnum.outLinkUsedPointsExceed,
        code: OutLinkErrEnum.outLinkUsedPointsExceed
      });
    }

    // 简单的频率检查提示（实际的频率限制可能在其他地方处理）
    console.log(`[INFO] QPM limit: ${QPM}, current request from IP: ${ip}`);

    // 生成或使用现有的用户ID
    const uid = outLinkUid || getNanoid();

    console.log('[SUCCESS] chatStart validation passed, uid:', uid);

    const result: AuthOutLinkResponse = {
      uid
    };

    return res.status(200).json(result);
  } catch (error) {
    console.error('[ERROR] chatStart failed:', error);

    return res.status(500).json({
      error: 'Internal server error'
    });
  }
}

export default NextAPI(handler);
