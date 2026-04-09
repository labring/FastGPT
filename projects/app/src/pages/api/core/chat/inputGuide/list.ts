import type { NextApiResponse } from 'next';
import { MongoChatInputGuide } from '@fastgpt/service/core/chat/inputGuide/schema';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import {
  ChatInputGuideListBodySchema,
  ChatInputGuideListResponseSchema,
  type ChatInputGuideListResponseType
} from '@fastgpt/global/openapi/core/chat/inputGuide/api';

async function handler(
  req: ApiRequestProps,
  res: NextApiResponse<any>
): Promise<ChatInputGuideListResponseType> {
  const { appId, searchKey } = ChatInputGuideListBodySchema.parse(req.body);
  const { offset, pageSize } = parsePaginationRequest(req);

  await authApp({ req, appId, authToken: true, per: ReadPermissionVal });

  const params = {
    appId,
    ...(searchKey && { text: { $regex: replaceRegChars(searchKey), $options: 'i' } })
  };

  const [result, total] = await Promise.all([
    MongoChatInputGuide.find(params).sort({ _id: -1 }).skip(offset).limit(pageSize),
    MongoChatInputGuide.countDocuments(params)
  ]);

  return ChatInputGuideListResponseSchema.parse({
    list: result,
    total
  });
}

export default NextAPI(handler);
