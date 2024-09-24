import type { NextApiResponse } from 'next';
import { MongoChatInputGuide } from '@fastgpt/service/core/chat/inputGuide/schema';
import { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import { NextAPI } from '@/service/middleware/entry';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { ChatInputGuideSchemaType } from '@fastgpt/global/core/chat/inputGuide/type';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';

export type ChatInputGuideProps = PaginationProps<{
  appId: string;
  searchKey: string;
}>;
export type ChatInputGuideResponse = PaginationResponse<ChatInputGuideSchemaType>;

async function handler(
  req: ApiRequestProps<ChatInputGuideProps>,
  res: NextApiResponse<any>
): Promise<ChatInputGuideResponse> {
  const { appId, pageSize, offset, searchKey } = req.body;

  await authApp({ req, appId, authToken: true, per: ReadPermissionVal });

  const params = {
    appId,
    ...(searchKey && { text: { $regex: new RegExp(searchKey, 'i') } })
  };

  const [result, total] = await Promise.all([
    MongoChatInputGuide.find(params).sort({ _id: -1 }).skip(offset).limit(pageSize),
    MongoChatInputGuide.countDocuments(params)
  ]);

  return {
    list: result,
    total
  };
}

export default NextAPI(handler);
