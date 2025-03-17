import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { NextApiRequest, NextApiResponse } from 'next';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { jiebaSplit } from '@fastgpt/service/common/string/jieba';
import { addLog } from '@fastgpt/service/common/system/log';
import { delay } from '@fastgpt/global/common/system/utils';

const updateData = async () => {
  let success = 0;
  while (true) {
    try {
      const data = await MongoDatasetData.find({ initJieba: { $exists: false } }).limit(100);
      if (data.length === 0) {
        console.log('更新分词完成');
        break;
      }

      await Promise.allSettled(
        data.map(async (item) => {
          const text = `${item.q} ${item.a}`.trim();
          item.fullTextToken = await jiebaSplit({ text });
          // @ts-ignore
          item.initJieba = true;
          await item.save();
        })
      );
      success += data.length;
      console.log(`成功 ${success}`);
    } catch (error) {
      addLog.error('更新所有旧的 jieba 分词失败', error);
      await delay(1000);
    }
  }
};

async function handler(req: NextApiRequest, _res: NextApiResponse) {
  await authCert({ req, authRoot: true });

  console.log('更新所有旧的 jieba 分词');
  updateData();
  return { success: true };
}

export default NextAPI(handler);
