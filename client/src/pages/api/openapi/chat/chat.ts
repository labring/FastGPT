import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { authUser, authApp, getApiKey } from '@/service/utils/auth';
import { modelServiceToolMap, resStreamResponse } from '@/service/utils/chat';
import { ChatItemType } from '@/types/chat';
import { jsonRes } from '@/service/response';
import { ChatModelMap } from '@/constants/model';
import { pushChatBill } from '@/service/events/pushBill';
import { ChatRoleEnum } from '@/constants/chat';
import { withNextCors } from '@/service/utils/tools';
import { BillTypeEnum } from '@/constants/user';
import { appKbSearch } from '../kb/appKbSearch';

/* 发送提示词 */
export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.on('close', () => {
    res.end();
  });
  res.on('error', () => {
    console.log('error: ', 'request error');
    res.end();
  });

  try {
    const {
      chatId,
      prompts,
      modelId,
      isStream = true
    } = req.body as {
      chatId?: string;
      prompts: ChatItemType[];
      modelId: string;
      isStream: boolean;
    };

    if (!prompts || !modelId) {
      throw new Error('缺少参数');
    }
    if (!Array.isArray(prompts)) {
      throw new Error('prompts is not array');
    }
    if (prompts.length > 30 || prompts.length === 0) {
      throw new Error('Prompts arr length range 1-30');
    }

    await connectToDatabase();
    let startTime = Date.now();

    /* 凭证校验 */
    const { userId } = await authUser({ req });

    const { app } = await authApp({
      userId,
      appId: modelId
    });

    /* get api key */
    const { systemAuthKey: apiKey } = await getApiKey({
      model: app.chat.chatModel,
      userId,
      mustPay: true
    });

    const modelConstantsData = ChatModelMap[app.chat.chatModel];
    const prompt = prompts[prompts.length - 1];

    const {
      userSystemPrompt = [],
      userLimitPrompt = [],
      quotePrompt = []
    } = await (async () => {
      // 使用了知识库搜索
      if (app.chat.relatedKbs?.length > 0) {
        const { quotePrompt, userSystemPrompt, userLimitPrompt } = await appKbSearch({
          model: app,
          userId,
          fixedQuote: [],
          prompt: prompt,
          similarity: app.chat.searchSimilarity,
          limit: app.chat.searchLimit
        });

        return {
          userSystemPrompt,
          userLimitPrompt,
          quotePrompt: [quotePrompt]
        };
      }
      return {
        userSystemPrompt: app.chat.systemPrompt
          ? [
              {
                obj: ChatRoleEnum.System,
                value: app.chat.systemPrompt
              }
            ]
          : [],
        userLimitPrompt: app.chat.limitPrompt
          ? [
              {
                obj: ChatRoleEnum.Human,
                value: app.chat.limitPrompt
              }
            ]
          : []
      };
    })();

    // search result is empty
    if (app.chat.relatedKbs?.length > 0 && !quotePrompt[0]?.value && app.chat.searchEmptyText) {
      const response = app.chat.searchEmptyText;
      return res.end(response);
    }

    // 读取对话内容
    const completePrompts = [
      ...quotePrompt,
      ...userSystemPrompt,
      ...prompts.slice(0, -1),
      ...userLimitPrompt,
      prompt
    ];

    // 计算温度
    const temperature = (modelConstantsData.maxTemperature * (app.chat.temperature / 10)).toFixed(
      2
    );

    // 发出请求
    const { streamResponse, responseMessages, responseText, totalTokens } =
      await modelServiceToolMap.chatCompletion({
        model: app.chat.chatModel,
        apiKey,
        temperature: +temperature,
        messages: completePrompts,
        stream: isStream,
        res
      });

    console.log('api response time:', `${(Date.now() - startTime) / 1000}s`);

    if (res.closed) return res.end();

    const { textLen = 0, tokens = totalTokens } = await (async () => {
      if (isStream) {
        try {
          const { finishMessages, totalTokens } = await resStreamResponse({
            model: app.chat.chatModel,
            res,
            chatResponse: streamResponse,
            prompts: responseMessages
          });
          res.end();
          return {
            textLen: finishMessages.map((item) => item.value).join('').length,
            tokens: totalTokens
          };
        } catch (error) {
          res.end();
          console.log('error，结束', error);
        }
      } else {
        jsonRes(res, {
          data: responseText
        });
        return {
          textLen: responseMessages.map((item) => item.value).join('').length
        };
      }
      return {};
    })();

    pushChatBill({
      isPay: true,
      chatModel: app.chat.chatModel,
      userId,
      textLen,
      tokens,
      type: BillTypeEnum.openapiChat
    });
  } catch (err: any) {
    res.status(500);
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
});
