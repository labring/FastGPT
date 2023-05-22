import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { authShareChat } from '@/service/utils/auth';
import { modelServiceToolMap } from '@/service/utils/chat';
import { ChatItemSimpleType } from '@/types/chat';
import { jsonRes } from '@/service/response';
import { ChatModelMap, ModelVectorSearchModeMap } from '@/constants/model';
import { pushChatBill, updateShareChatBill } from '@/service/events/pushBill';
import { resStreamResponse } from '@/service/utils/chat';
import { searchKb } from '@/service/plugins/searchKb';
import { ChatRoleEnum } from '@/constants/chat';
import { BillTypeEnum } from '@/constants/user';
import { sensitiveCheck } from '@/service/api/text';

/* 发送提示词 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let step = 0; // step=1 时，表示开始了流响应
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

    let systemPrompts: {
      obj: ChatRoleEnum;
      value: string;
    }[] = [];

    // 使用了知识库搜索
    if (model.chat.relatedKbs.length > 0) {
      const { code, searchPrompts } = await searchKb({
        userOpenAiKey,
        prompts,
        similarity: ModelVectorSearchModeMap[model.chat.searchMode]?.similarity,
        model,
        userId
      });

      // search result is empty
      if (code === 201) {
        return res.send(searchPrompts[0]?.value);
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

    prompts.splice(prompts.length - 3, 0, ...systemPrompts);

    // content check
    await sensitiveCheck({
      input: [...systemPrompts, prompts[prompts.length - 1]].map((item) => item.value).join('')
    });

    // 计算温度
    const temperature = (modelConstantsData.maxTemperature * (model.chat.temperature / 10)).toFixed(
      2
    );

    // 发出请求
    const { streamResponse } = await modelServiceToolMap[model.chat.chatModel].chatCompletion({
      apiKey: userOpenAiKey || systemAuthKey,
      temperature: +temperature,
      messages: prompts,
      stream: true,
      res,
      chatId: historyId
    });

    console.log('api response time:', `${(Date.now() - startTime) / 1000}s`);

    step = 1;

    const { totalTokens, finishMessages } = await resStreamResponse({
      model: model.chat.chatModel,
      res,
      chatResponse: streamResponse,
      prompts,
      systemPrompt: ''
    });

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
  } catch (err: any) {
    if (step === 1) {
      // 直接结束流
      res.end();
      console.log('error，结束');
    } else {
      res.status(500);
      jsonRes(res, {
        code: 500,
        error: err
      });
    }
  }
}
