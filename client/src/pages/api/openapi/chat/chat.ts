import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { authUser, authModel, getApiKey } from '@/service/utils/auth';
import { modelServiceToolMap, resStreamResponse } from '@/service/utils/chat';
import { ChatItemSimpleType } from '@/types/chat';
import { jsonRes } from '@/service/response';
import { ChatModelMap, ModelVectorSearchModeMap } from '@/constants/model';
import { pushChatBill } from '@/service/events/pushBill';
import { ChatRoleEnum } from '@/constants/chat';
import { withNextCors } from '@/service/utils/tools';
import { BillTypeEnum } from '@/constants/user';
import { sensitiveCheck } from '@/service/api/text';
import { NEW_CHATID_HEADER } from '@/constants/chat';
import { Types } from 'mongoose';
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
      prompts: ChatItemSimpleType[];
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

    const { model } = await authModel({
      userId,
      modelId
    });

    /* get api key */
    const { systemAuthKey: apiKey } = await getApiKey({
      model: model.chat.chatModel,
      userId,
      mustPay: true
    });

    const modelConstantsData = ChatModelMap[model.chat.chatModel];

    let systemPrompts: {
      obj: ChatRoleEnum;
      value: string;
    }[] = [];

    // 使用了知识库搜索
    if (model.chat.relatedKbs.length > 0) {
      const { code, searchPrompts } = await appKbSearch({
        model,
        userId,
        fixedQuote: [],
        prompt: prompts[prompts.length - 1],
        similarity: ModelVectorSearchModeMap[model.chat.searchMode]?.similarity
      });

      // search result is empty
      if (code === 201) {
        return isStream
          ? res.send(searchPrompts[0]?.value)
          : jsonRes(res, {
              data: searchPrompts[0]?.value,
              message: searchPrompts[0]?.value
            });
      }

      systemPrompts = searchPrompts;
    } else if (model.chat.systemPrompt) {
      systemPrompts = [
        {
          obj: ChatRoleEnum.System,
          value: model.chat.systemPrompt
        }
      ];
    }

    prompts.unshift(...systemPrompts);

    // content check
    await sensitiveCheck({
      input: [...systemPrompts, prompts[prompts.length - 1]].map((item) => item.value).join('')
    });

    // 计算温度
    const temperature = (modelConstantsData.maxTemperature * (model.chat.temperature / 10)).toFixed(
      2
    );

    // get conversationId. create a newId if it is null
    const conversationId = chatId || String(new Types.ObjectId());
    !chatId && res?.setHeader(NEW_CHATID_HEADER, conversationId);

    // 发出请求
    const { streamResponse, responseMessages, responseText, totalTokens } =
      await modelServiceToolMap[model.chat.chatModel].chatCompletion({
        apiKey,
        temperature: +temperature,
        messages: prompts,
        stream: isStream,
        res,
        chatId: conversationId
      });

    console.log('api response time:', `${(Date.now() - startTime) / 1000}s`);

    if (res.closed) return res.end();

    const { textLen = 0, tokens = totalTokens } = await (async () => {
      if (isStream) {
        try {
          const { finishMessages, totalTokens } = await resStreamResponse({
            model: model.chat.chatModel,
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
      chatModel: model.chat.chatModel,
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
