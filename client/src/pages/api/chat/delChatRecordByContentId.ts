import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Chat } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { useTranslation } from 'react-i18next';

const { t } = useTranslation();
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { chatId, contentId } = req.query as { chatId: string; contentId: string };

    if (!chatId || !contentId) {
      throw new Error(t('缺少参数'));
    }

    await connectToDatabase();

    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    const chatRecord = await Chat.findOne({ chatId });

    if (!chatRecord) {
      throw new Error(t('找不到对话'));
    }

    // 删除一条数据库记录
    await Chat.updateOne(
      {
        chatId,
        userId
      },
      { $pull: { content: { _id: contentId } } }
    );

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
