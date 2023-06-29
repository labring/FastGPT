import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { authUser, authModel, getApiKey, authShareChat } from '@/service/utils/auth';
import { modelServiceToolMap, V2_StreamResponse } from '@/service/utils/chat';
import { jsonRes } from '@/service/response';
import { ChatModelMap } from '@/constants/model';
import { pushChatBill, updateShareChatBill } from '@/service/events/pushBill';
import { ChatRoleEnum, sseResponseEventEnum } from '@/constants/chat';
import { withNextCors } from '@/service/utils/tools';
import { BillTypeEnum } from '@/constants/user';
import { appKbSearch } from '../../../openapi/kb/appKbSearch';
import type { CreateChatCompletionRequest } from 'openai';
import { gptMessage2ChatType, textAdaptGptResponse } from '@/utils/adapt';
import { getChatHistory } from './getHistory';
import { saveChat } from '@/pages/api/chat/saveChat';
import { sseResponse } from '@/service/utils/tools';
import { type ChatCompletionRequestMessage } from 'openai';
import { Types } from 'mongoose';
import { sensitiveCheck } from '../../text/sensitiveCheck';

export type MessageItemType = ChatCompletionRequestMessage & { _id?: string };
type FastGptWebChatProps = {
  chatId?: string; // undefined: nonuse history, '': new chat, 'xxxxx': use history
  appId?: string;
};
type FastGptShareChatProps = {
  password?: string;
  shareId?: string;
};
export type Props = CreateChatCompletionRequest &
  FastGptWebChatProps &
  FastGptShareChatProps & {
    messages: MessageItemType[];
  };
export type ChatResponseType = {
  newChatId: string;
  quoteLen?: number;
};

/* 发送提示词 */
export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.on('close', () => {
    res.end();
  });
  res.on('error', () => {
    console.log('error: ', 'request error');
    res.end();
  });

  let { chatId, appId, shareId, password = '', stream = false, messages = [] } = req.body as Props;
  let step = 0;

  try {
    if (!messages) {
      throw new Error('Prams Error');
    }
    if (!Array.isArray(messages)) {
      throw new Error('messages is not array');
    }

    await connectToDatabase();
    let startTime = Date.now();

    /* user auth */
    const {
      userId,
      appId: authAppid,
      authType
    } = await (shareId
      ? authShareChat({
          shareId,
          password
        })
      : authUser({ req }));

    appId = appId ? appId : authAppid;
    if (!appId) {
      throw new Error('appId is empty');
    }

    // auth app permission
    const { model, showModelDetail } = await authModel({
      userId,
      modelId: appId,
      authOwner: false,
      reserveDetail: true
    });

    const showAppDetail = !shareId && showModelDetail;

    /* get api key */
    const { systemAuthKey: apiKey, userOpenAiKey } = await getApiKey({
      model: model.chat.chatModel,
      userId,
      mustPay: authType !== 'token'
    });

    // get history
    const { history } = await getChatHistory({ chatId, userId });
    const prompts = history.concat(gptMessage2ChatType(messages));
    // adapt fastgpt web
    if (prompts[prompts.length - 1].obj === 'AI') {
      prompts.pop();
    }
    // user question
    const prompt = prompts[prompts.length - 1];

    const {
      rawSearch = [],
      userSystemPrompt = [],
      userLimitPrompt = [],
      quotePrompt = []
    } = await (async () => {
      // 使用了知识库搜索
      if (model.chat.relatedKbs?.length > 0) {
        const { rawSearch, quotePrompt, userSystemPrompt, userLimitPrompt } = await appKbSearch({
          model,
          userId,
          fixedQuote: history[history.length - 1]?.quote,
          prompt,
          similarity: model.chat.searchSimilarity,
          limit: model.chat.searchLimit
        });

        return {
          rawSearch,
          userSystemPrompt,
          userLimitPrompt,
          quotePrompt: [quotePrompt]
        };
      }
      return {
        userSystemPrompt: model.chat.systemPrompt
          ? [
              {
                obj: ChatRoleEnum.System,
                value: model.chat.systemPrompt
              }
            ]
          : [],
        userLimitPrompt: model.chat.limitPrompt
          ? [
              {
                obj: ChatRoleEnum.Human,
                value: model.chat.limitPrompt
              }
            ]
          : []
      };
    })();

    // search result is empty
    if (model.chat.relatedKbs?.length > 0 && !quotePrompt[0]?.value && model.chat.searchEmptyText) {
      const response = model.chat.searchEmptyText;
      if (stream) {
        sseResponse({
          res,
          event: sseResponseEventEnum.answer,
          data: textAdaptGptResponse({
            text: response,
            model: model.chat.chatModel,
            finish_reason: 'stop'
          })
        });
        return res.end();
      } else {
        return res.json({
          id: chatId || '',
          model: model.chat.chatModel,
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          choices: [
            { message: { role: 'assistant', content: response }, finish_reason: 'stop', index: 0 }
          ]
        });
      }
    }

    // api messages. [quote,context,systemPrompt,question]
    const completePrompts = [
      ...quotePrompt,
      ...userSystemPrompt,
      ...prompts.slice(0, -1),
      ...userLimitPrompt,
      prompt
    ];
    // chat temperature
    const modelConstantsData = ChatModelMap[model.chat.chatModel];
    // FastGpt temperature range: 1~10
    const temperature = (modelConstantsData.maxTemperature * (model.chat.temperature / 10)).toFixed(
      2
    );

    await sensitiveCheck({
      input: `${userSystemPrompt[0]?.value}\n${userLimitPrompt[0]?.value}\n${prompt.value}`
    });

    // start model api. responseText and totalTokens: valid only if stream = false
    const { streamResponse, responseMessages, responseText, totalTokens } =
      await modelServiceToolMap[model.chat.chatModel].chatCompletion({
        apiKey: userOpenAiKey || apiKey,
        temperature: +temperature,
        maxToken: model.chat.maxToken,
        messages: completePrompts,
        stream,
        res
      });

    console.log('api response time:', `${(Date.now() - startTime) / 1000}s`);

    if (res.closed) return res.end();

    // create a chatId
    const newChatId = chatId === '' ? new Types.ObjectId() : undefined;

    // response answer
    const {
      textLen = 0,
      answer = responseText,
      tokens = totalTokens
    } = await (async () => {
      if (stream) {
        // 创建响应流
        res.setHeader('Content-Type', 'text/event-stream;charset-utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Transfer-Encoding', 'chunked');
        res.setHeader('X-Accel-Buffering', 'no');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        step = 1;

        try {
          // response newChatId and quota
          sseResponse({
            res,
            event: sseResponseEventEnum.chatResponse,
            data: JSON.stringify({
              newChatId,
              quoteLen: rawSearch.length
            })
          });
          // response answer
          const { finishMessages, totalTokens, responseContent } = await V2_StreamResponse({
            model: model.chat.chatModel,
            res,
            chatResponse: streamResponse,
            prompts: responseMessages
          });
          return {
            answer: responseContent,
            textLen: finishMessages.map((item) => item.value).join('').length,
            tokens: totalTokens
          };
        } catch (error) {
          return Promise.reject(error);
        }
      } else {
        return {
          textLen: responseMessages.map((item) => item.value).join('').length
        };
      }
    })();

    // save chat history
    if (typeof chatId === 'string') {
      await saveChat({
        newChatId,
        chatId,
        modelId: appId,
        prompts: [
          prompt,
          {
            _id: messages[messages.length - 1]._id,
            obj: ChatRoleEnum.AI,
            value: answer,
            ...(showAppDetail
              ? {
                  quote: rawSearch,
                  systemPrompt: `${userSystemPrompt[0]?.value}\n\n${userLimitPrompt[0]?.value}`
                }
              : {})
          }
        ],
        userId
      });
    }

    // close response
    if (stream) {
      res.end();
    } else {
      res.json({
        ...(showAppDetail
          ? {
              rawSearch
            }
          : {}),
        newChatId,
        id: chatId || '',
        model: model.chat.chatModel,
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: tokens },
        choices: [
          { message: { role: 'assistant', content: answer }, finish_reason: 'stop', index: 0 }
        ]
      });
    }

    pushChatBill({
      isPay: !userOpenAiKey,
      chatModel: model.chat.chatModel,
      userId,
      textLen,
      tokens,
      type: authType === 'apikey' ? BillTypeEnum.openapiChat : BillTypeEnum.chat
    });
    shareId &&
      updateShareChatBill({
        shareId,
        tokens
      });
  } catch (err: any) {
    res.status(500);
    if (step === 1) {
      sseResponse({
        res,
        event: sseResponseEventEnum.error,
        data: JSON.stringify(err)
      });
      res.end();
    } else {
      jsonRes(res, {
        code: 500,
        error: err
      });
    }
  }
});
