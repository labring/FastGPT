import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { System } from '@/service/models/system';
import { authUser } from '@/service/utils/auth';
import { connectToDatabase } from '@/service/mongo';
import { OpenAIKey } from '@/service/models/openaiKey';
import { checkBilling } from '@/service/utils/checkBillingForOpenAI';
import dayjs from 'dayjs';

export type InitDateResponse = {
  beianText: string;
  googleVerKey: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await authUser({ req, authRoot: true });
  syncOpenAIKeyHandler(req.body.openAIKey);
  jsonRes(res, { message: 'success' });
}

export async function syncOpenAIKeyHandler(openAIKey: string) {
  try {
    await connectToDatabase();
    // 查询CD 默认60s 官网每5分钟更新key的可用性
    const checkInterval = global.systemEnv.sycnOpenAIKeyInterval || 60;
    // 没有加active: true 因为有的key 每月重置 复活一次 可用于整体同步时捡漏
    const mongoKey = await OpenAIKey.findOne({ apikey: openAIKey });

    if (!mongoKey) return console.log('sync openAIKey error, key not found', openAIKey);
    if (
      mongoKey.lastSyncAt &&
      dayjs(mongoKey.lastUsedAt).diff(dayjs(mongoKey.lastSyncAt), 'second') < checkInterval
    )
      return console.log('sync openAIKey freezing', checkInterval);

    checkBilling(openAIKey)
      .then(async (res) => {
        if (res) {
          mongoKey.balanceAvailable = +res.remaining ?? mongoKey.balanceAvailable;
          mongoKey.balanceTotal = +res.totalAmount ?? mongoKey.balanceTotal;
          mongoKey.balanceUsed = +res.totalUsage ?? mongoKey.balanceUsed;
          mongoKey.isGPT4 = !!res.GPT4CheckResult;
          mongoKey.expiresAt = dayjs(res.formattedDate).toDate();
          mongoKey.cardLinked = !!res.isSubscrible;

          if (res.remaining <= 0 || dayjs(res.formattedDate).isBefore(dayjs())) {
            mongoKey.active = false;
          }
        }
      })
      .catch((err) => {
        console.log('sync openAIKey error', mongoKey.apikey);

        mongoKey.error = err.message || 'unknown error';
        if (err.message.includes('APIKEY ERROR:')) mongoKey.active = false;
      })
      .finally(async () => {
        mongoKey.lastSyncAt = new Date();
        await mongoKey.save();
        console.log('sync openAIKey', mongoKey.apikey, dayjs().format('HH:mm:ss'));
      });
  } catch (error) {
    console.log('sync openAIKey error!!!');
  }
}
