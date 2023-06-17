import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { authShareChat } from '@/service/utils/auth';
import { modelServiceToolMap } from '@/service/utils/chat';
import { ChatItemSimpleType } from '@/types/chat';
import { jsonRes } from '@/service/response';
import { ChatModelMap } from '@/constants/model';
import { pushChatBill, updateShareChatBill } from '@/service/events/pushBill';
import { resStreamResponse } from '@/service/utils/chat';
import { ChatRoleEnum } from '@/constants/chat';
import { BillTypeEnum } from '@/constants/user';
import { sensitiveCheck } from '../../openapi/text/sensitiveCheck';
import { appKbSearch } from '../../openapi/kb/appKbSearch';

/* 发送提示词 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.on('error', () => {
    console.log('error: ', 'request error');
    res.end();
  });

  try {
    const { shareId, password, historyId, prompts } = req.body as {
      prompts: ChatItemSimpleType[];
      password: string;
      shareId: string;
      historyId: string;
    };

    if (!historyId || !prompts) {
      throw new Error('分享链接无效');
    }

    await connectToDatabase();
    let startTime = Date.now();

    const { model, userOpenAiKey, systemAuthKey, userId } = await authShareChat({
      shareId,
      password
    });

    const modelConstantsData = ChatModelMap[model.chat.chatModel];
    const prompt = prompts[prompts.length - 1];

    const {
      rawSearch = [],
      userSystemPrompt = [],
      quotePrompt = []
    } = await (async () => {
      // 使用了知识库搜索
      if (model.chat.relatedKbs?.length > 0) {
        const { rawSearch, userSystemPrompt, quotePrompt } = await appKbSearch({
          model,
          userId,
          fixedQuote: [],
          prompt: prompt,
          similarity: model.chat.searchSimilarity,
          limit: model.chat.searchLimit
        });

        return {
          rawSearch: rawSearch,
          userSystemPrompt: userSystemPrompt ? [userSystemPrompt] : [],
          quotePrompt: [quotePrompt]
        };
      }
      if (model.chat.systemPrompt) {
        return {
          userSystemPrompt: [
            {
              obj: ChatRoleEnum.System,
              value: model.chat.systemPrompt
            }
          ]
        };
      }
      return {};
    })();

    // search result is empty
    if (model.chat.relatedKbs?.length > 0 && !quotePrompt[0]?.value && model.chat.searchEmptyText) {
      const response = model.chat.searchEmptyText;
      return res.end(response);
    }

    // 读取对话内容
    const completePrompts = [...quotePrompt, ...prompts.slice(0, -1), ...userSystemPrompt, prompt];

    // content check
    await sensitiveCheck({
      input: [...quotePrompt, ...userSystemPrompt, prompt].map((item) => item.value).join('')
    });

    // 计算温度
    const temperature = (modelConstantsData.maxTemperature * (model.chat.temperature / 10)).toFixed(
      2
    );

    // 发出请求
    const { streamResponse, responseMessages } = await modelServiceToolMap[
      model.chat.chatModel
    ].chatCompletion({
      apiKey: userOpenAiKey || systemAuthKey,
      temperature: +temperature,
      messages: completePrompts,
      stream: true,
      res,
      chatId: historyId
    });

    console.log('api response time:', `${(Date.now() - startTime) / 1000}s`);

    if (res.closed) return res.end();

    try {
      const { totalTokens, finishMessages } = await resStreamResponse({
        model: model.chat.chatModel,
        res,
        chatResponse: streamResponse,
        prompts: responseMessages
      });

      res.end();

      /* bill */
      pushChatBill({
        isPay: !userOpenAiKey,
        chatModel: model.chat.chatModel,
        userId,
        textLen: finishMessages.map((item) => item.value).join('').length,
        tokens: totalTokens,
        type: BillTypeEnum.chat
      });
      updateShareChatBill({
        shareId,
        tokens: totalTokens
      });
    } catch (error) {
      res.end();
      console.log('error，结束', error);
    }
  } catch (err: any) {
    res.status(500);
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
