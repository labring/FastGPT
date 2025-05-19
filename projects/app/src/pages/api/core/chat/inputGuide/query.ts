import type { NextApiResponse } from 'next';
import { MongoChatInputGuide } from '@fastgpt/service/core/chat/inputGuide/schema';
import { NextAPI } from '@/service/middleware/entry';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';

export type QueryChatInputGuideBody = OutLinkChatAuthProps & {
  appId: string;
  searchKey: string;
};
export type QueryChatInputGuideResponse = string[];

async function handler(
  req: ApiRequestProps<QueryChatInputGuideBody>,
  res: NextApiResponse<any>
): Promise<QueryChatInputGuideResponse> {
  const { appId, searchKey } = req.body;

  // tmp auth
  const { teamId } = await authChatCrud({ req, authToken: true, ...req.body });
  const app = await MongoApp.findOne({ _id: appId, teamId });
  if (!app) {
    return Promise.reject(AppErrEnum.unAuthApp);
  }

  const params = {
    appId,
    ...(searchKey && { text: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } })
  };

  const result = await MongoChatInputGuide.find(params).sort({ _id: -1 }).limit(6);

  return result
    .map((item) => item.text)
    .filter(Boolean)
    .filter((item) => item !== searchKey);
}

export default NextAPI(handler);
