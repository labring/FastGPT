import type { NextApiResponse } from 'next';
import { MongoChatInputGuide } from '@fastgpt/service/core/chat/inputGuide/schema';
import { NextAPI } from '@/service/middleware/entry';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { authApp } from '@fastgpt/service/support/permission/auth/app';

export type QueryChatInputGuideProps = {
  appId: string;
  searchKey: string;
};
export type QueryChatInputGuideResponse = string[];

async function handler(
  req: ApiRequestProps<{}, QueryChatInputGuideProps>,
  res: NextApiResponse<any>
): Promise<QueryChatInputGuideResponse> {
  const { appId, searchKey } = req.query;

  await authApp({ req, appId, authToken: true, authApiKey: true, per: 'r' });

  const params = {
    appId,
    ...(searchKey && { text: { $regex: new RegExp(searchKey, 'i') } })
  };

  const result = await MongoChatInputGuide.find(params).sort({ _id: -1 }).limit(6);

  return result
    .map((item) => item.text)
    .filter(Boolean)
    .filter((item) => item !== searchKey);
}

export default NextAPI(handler);
