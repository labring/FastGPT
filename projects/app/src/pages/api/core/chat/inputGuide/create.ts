import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { MongoChatInputGuide } from '@fastgpt/service/core/chat/inputGuide/schema';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  CreateChatInputGuideBodySchema,
  CreateChatInputGuideResponseSchema,
  type CreateChatInputGuideResponseType
} from '@fastgpt/global/openapi/core/chat/inputGuide/api';

async function handler(
  req: ApiRequestProps,
  _res: NextApiResponse
): Promise<CreateChatInputGuideResponseType> {
  const { appId, textList } = CreateChatInputGuideBodySchema.parse(req.body);
  await authApp({ req, appId, authToken: true, per: WritePermissionVal });

  try {
    const result = await MongoChatInputGuide.insertMany(
      textList.map((text) => ({
        appId,
        text
      })),
      {
        ordered: false
      }
    );
    return CreateChatInputGuideResponseSchema.parse({ insertLength: result.length });
  } catch (error: any) {
    const errLength = error.writeErrors?.length ?? textList.length;
    return CreateChatInputGuideResponseSchema.parse({
      insertLength: textList.length - errLength
    });
  }
}

export default NextAPI(handler);
