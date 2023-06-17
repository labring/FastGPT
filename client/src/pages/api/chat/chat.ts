import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { authChat } from '@/service/utils/auth';
import { modelServiceToolMap } from '@/service/utils/chat';
import { ChatItemType } from '@/types/chat';
import { jsonRes } from '@/service/response';
import { ChatModelMap } from '@/constants/model';
import { pushChatBill } from '@/service/events/pushBill';
import { resStreamResponse } from '@/service/utils/chat';
import { appKbSearch } from '../openapi/kb/appKbSearch';
import { ChatRoleEnum, QUOTE_LEN_HEADER, GUIDE_PROMPT_HEADER } from '@/constants/chat';
import { BillTypeEnum } from '@/constants/user';
import { sensitiveCheck } from '../openapi/text/sensitiveCheck';
import { NEW_CHATID_HEADER } from '@/constants/chat';
import { saveChat } from './saveChat';
import { Types } from 'mongoose';

/* 发送提示词 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.on('close', () => {
    res.end();
  });
  res.on('error', () => {
    console.log('error: ', 'request error');
    res.end();
  });

  try {
    const { chatId, prompt, modelId } = req.body as {
      prompt: [ChatItemType, ChatItemType];
      modelId: string;
      chatId?: string;
    };

    if (!modelId || !prompt || prompt.length !== 2) {
      throw new Error('Chat 缺少参数');
    }

    await connectToDatabase();
    let startTime = Date.now();

    const { model, showModelDetail, content, userOpenAiKey, systemAuthKey, userId } =
      await authChat({
        modelId,
        chatId,
        req
      });

    const modelConstantsData = ChatModelMap[model.chat.chatModel];

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
          fixedQuote: content[content.length - 1]?.quote || [],
          prompt: prompt[0],
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

    // get conversationId. create a newId if it is null
    const conversationId = chatId || String(new Types.ObjectId());
    !chatId && res.setHeader(NEW_CHATID_HEADER, conversationId);
    if (showModelDetail) {
      userSystemPrompt[0] &&
        res.setHeader(GUIDE_PROMPT_HEADER, encodeURIComponent(userSystemPrompt[0].value));
      res.setHeader(QUOTE_LEN_HEADER, rawSearch.length);
    }

    // search result is empty
    if (model.chat.relatedKbs?.length > 0 && !quotePrompt[0]?.value && model.chat.searchEmptyText) {
      const response = model.chat.searchEmptyText;
      await saveChat({
        chatId,
        newChatId: conversationId,
        modelId,
        prompts: [
          prompt[0],
          {
            ...prompt[1],
            quote: [],
            value: response
          }
        ],
        userId
      });
      return res.end(response);
    }

    // 读取对话内容
    const prompts = [...quotePrompt, ...content, ...userSystemPrompt, prompt[0]];

    // content check
    await sensitiveCheck({
      input: [...quotePrompt, ...userSystemPrompt, prompt[0]].map((item) => item.value).join('')
    });

    // 计算温度
    const temperature = (modelConstantsData.maxTemperature * (model.chat.temperature / 10)).toFixed(
      2
    );

    // 发出 chat 请求
    const { streamResponse, responseMessages } = await modelServiceToolMap[
      model.chat.chatModel
    ].chatCompletion({
      apiKey: userOpenAiKey || systemAuthKey,
      temperature: +temperature,
      messages: prompts,
      stream: true,
      res,
      chatId: conversationId
    });

    console.log('api response time:', `${(Date.now() - startTime) / 1000}s`);

    if (res.closed) return res.end();

    try {
      const { totalTokens, finishMessages, responseContent } = await resStreamResponse({
        model: model.chat.chatModel,
        res,
        chatResponse: streamResponse,
        prompts: responseMessages
      });

      // save chat
      await saveChat({
        chatId,
        newChatId: conversationId,
        modelId,
        prompts: [
          prompt[0],
          {
            ...prompt[1],
            value: responseContent,
            quote: showModelDetail ? rawSearch : [],
            systemPrompt: showModelDetail ? userSystemPrompt[0]?.value : ''
          }
        ],
        userId
      });

      res.end();

      // 只有使用平台的 key 才计费
      pushChatBill({
        isPay: !userOpenAiKey,
        chatModel: model.chat.chatModel,
        userId,
        chatId: conversationId,
        textLen: finishMessages.map((item) => item.value).join('').length,
        tokens: totalTokens,
        type: BillTypeEnum.chat
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
