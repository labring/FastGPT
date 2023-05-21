import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { authChat } from '@/service/utils/auth';
import { modelServiceToolMap } from '@/service/utils/chat';
import { ChatItemSimpleType } from '@/types/chat';
import { jsonRes } from '@/service/response';
import { ChatModelMap, ModelVectorSearchModeMap } from '@/constants/model';
import { pushChatBill } from '@/service/events/pushBill';
import { resStreamResponse } from '@/service/utils/chat';
import { searchKb } from '@/service/plugins/searchKb';
import { ChatRoleEnum } from '@/constants/chat';
import { BillTypeEnum } from '@/constants/user';

/* 发送提示词 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let step = 0; // step=1时，表示开始了流响应
  res.on('error', () => {
    console.log('error: ', 'request error');
    res.end();
  });

  try {
    const { chatId, prompt, modelId } = req.body as {
      prompt: ChatItemSimpleType;
      modelId: string;
      chatId: '' | string;
    };

    if (!modelId || !prompt) {
      throw new Error('缺少参数');
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

    // 读取对话内容
    const prompts = [...content, prompt];

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

      prompts.splice(prompts.length - 3, 0, ...searchPrompts);
    } else {
      // 没有用知识库搜索，仅用系统提示词
      model.chat.systemPrompt &&
        prompts.splice(prompts.length - 3, 0, {
          obj: ChatRoleEnum.System,
          value: model.chat.systemPrompt
        });
    }

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
      chatId
    });

    console.log('api response time:', `${(Date.now() - startTime) / 1000}s`);

    step = 1;

    const { totalTokens, finishMessages } = await resStreamResponse({
      model: model.chat.chatModel,
      res,
      chatResponse: streamResponse,
      prompts,
      systemPrompt: showModelDetail
        ? prompts
            .filter((item) => item.obj === ChatRoleEnum.System)
            .map((item) => item.value)
            .join('\n')
        : ''
    });

    // 只有使用平台的 key 才计费
    pushChatBill({
      isPay: !userOpenAiKey,
      chatModel: model.chat.chatModel,
      userId,
      chatId,
      textLen: finishMessages.map((item) => item.value).join('').length,
      tokens: totalTokens,
      type: BillTypeEnum.chat
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
