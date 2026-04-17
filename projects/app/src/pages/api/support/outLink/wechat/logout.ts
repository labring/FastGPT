import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { authOutLinkValid } from '@fastgpt/service/support/permission/publish/authLink';
import type { WechatAppType } from '@fastgpt/global/support/outLink/type';

async function handler(req: ApiRequestProps<{ shareId: string }>): Promise<void> {
  const { shareId } = req.body;

  await authOutLinkValid<WechatAppType>({ shareId });

  await MongoOutLink.updateOne(
    { shareId },
    {
      $set: {
        'app.status': 'offline',
        'app.token': '',
        'app.lastError': ''
      }
    }
  );
}

export default NextAPI(handler);
