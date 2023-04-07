import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase, Model } from '@/service/mongo';
import { getOpenAIApi } from '@/service/utils/chat';
import { authOpenApiKey } from '@/service/utils/tools';
import { httpsAgent, openaiChatFilter, systemPromptFilter } from '@/service/utils/tools';
import { ChatCompletionRequestMessage, ChatCompletionRequestMessageRoleEnum } from 'openai';
import { ChatItemType } from '@/types/chat';
import { jsonRes } from '@/service/response';
import { PassThrough } from 'stream';
import { ChatModelNameEnum, modelList, ChatModelNameMap } from '@/constants/model';
import { pushChatBill } from '@/service/events/pushBill';
import { connectRedis } from '@/service/redis';
import { VecModelDataPrefix } from '@/constants/redis';
import { vectorToBuffer } from '@/utils/tools';
import { openaiCreateEmbedding, getOpenApiKey, gpt35StreamResponse } from '@/service/utils/openai';

/* 发送提示词 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let step = 0; // step=1时，表示开始了流响应
  const stream = new PassThrough();
  stream.on('error', () => {
    console.log('error: ', 'stream error');
    stream.destroy();
  });
  res.on('close', () => {
    stream.destroy();
  });
  res.on('error', () => {
    console.log('error: ', 'request error');
    stream.destroy();
  });

  try {
    const { prompt, modelId } = req.body as {
      prompt: ChatItemType;
      modelId: string;
    };

    if (!prompt) {
      throw new Error('缺少参数');
    }

    await connectToDatabase();
    const redis = await connectRedis();
    let startTime = Date.now();

    /* 凭证校验 */
    const userId = await authOpenApiKey(req);

    const { userApiKey, systemKey } = await getOpenApiKey(userId);

    /* 查找数据库里的模型信息 */
    const model = await Model.findById(modelId);
    if (!model) {
      throw new Error('找不到模型');
    }

    const modelConstantsData = modelList.find(
      (item) => item.model === ChatModelNameEnum.VECTOR_GPT
    );
    if (!modelConstantsData) {
      throw new Error('模型已下架');
    }

    // 获取 chatAPI
    const chatAPI = getOpenAIApi(userApiKey || systemKey);

    // 请求一次 chatgpt 拆解需求
    const promptResponse = await chatAPI.createChatCompletion(
      {
        model: ChatModelNameMap[ChatModelNameEnum.GPT35],
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: `服务端逻辑生成器.根据用户输入的需求,拆解成代码实现的步骤,并按格式返回: 1.\n2.\n3.\n ......
下面是一些例子:
实现一个手机号发生注册验证码方法.
1. 从 query 中获取 phone.
2. 校验手机号格式是否正确,不正确返回{error: "手机号格式错误"}.
3. 给 phone 发送一个短信验证码,验证码长度为6位字符串,内容为:你正在注册laf,验证码为:code.
4. 数据库添加数据,表为"codes",内容为 {phone, code}.

实现根据手机号注册账号,需要验证手机验证码.
1. 从 body 中获取 phone 和 code.
2. 校验手机号格式是否正确,不正确返回{error: "手机号格式错误"}.
2. 获取数据库数据,表为"codes",查找是否有符合 phone, code 等于body参数的记录,没有的话返回 {error:"验证码不正确"}.
4. 添加数据库数据,表为"users" ,内容为{phone, code, createTime}.
5. 删除数据库数据,删除 code 记录.

更新博客记录。传入blogId,blogText,tags,还需要记录更新的时间.
1. 从 body 中获取 blogId,blogText 和 tags.
2. 校验 blogId 是否为空,为空则返回 {error: "博客ID不能为空"}.
3. 校验 blogText 是否为空,为空则返回 {error: "博客内容不能为空"}.
4. 校验 tags 是否为数组,不是则返回 {error: "标签必须为数组"}.
5. 获取当前时间,记录为 updateTime.
6. 更新数据库数据,表为"blogs",更新符合 blogId 的记录的内容为{blogText, tags, updateTime}.
7. 返回结果 {message: "更新博客记录成功"}.`
          },
          {
            role: 'user',
            content: prompt.value
          }
        ]
      },
      {
        timeout: 40000,
        httpsAgent
      }
    );

    const promptResolve = promptResponse.data.choices?.[0]?.message?.content || '';
    if (!promptResolve) {
      throw new Error('gpt 异常');
    }

    prompt.value += `\n${promptResolve}`;
    console.log('prompt resolve success, time:', `${(Date.now() - startTime) / 1000}s`);

    // 获取提示词的向量
    const { vector: promptVector } = await openaiCreateEmbedding({
      isPay: !userApiKey,
      apiKey: userApiKey || systemKey,
      userId,
      text: prompt.value
    });

    // 读取对话内容
    const prompts = [prompt];

    // 搜索系统提示词, 按相似度从 redis 中搜出相关的 q 和 text
    const redisData: any[] = await redis.sendCommand([
      'FT.SEARCH',
      `idx:${VecModelDataPrefix}:hash`,
      `@modelId:{${String(model._id)}}=>[KNN 20 @vector $blob AS score]`,
      'RETURN',
      '1',
      'text',
      'SORTBY',
      'score',
      'PARAMS',
      '2',
      'blob',
      vectorToBuffer(promptVector),
      'DIALECT',
      '2'
    ]);

    // 格式化响应值，获取 qa
    const formatRedisPrompt: string[] = [];
    for (let i = 2; i < 42; i += 2) {
      const text = redisData[i]?.[1];
      if (text) {
        formatRedisPrompt.push(text);
      }
    }

    // textArr 筛选，最多 3200 tokens
    const systemPrompt = systemPromptFilter(formatRedisPrompt, 3200);

    prompts.unshift({
      obj: 'SYSTEM',
      value: `${model.systemPrompt} 知识库内容是最新的，知识库内容为: "${systemPrompt}"`
    });

    // 控制在 tokens 数量，防止超出
    const filterPrompts = openaiChatFilter(prompts, modelConstantsData.contextMaxToken);

    // 格式化文本内容成 chatgpt 格式
    const map = {
      Human: ChatCompletionRequestMessageRoleEnum.User,
      AI: ChatCompletionRequestMessageRoleEnum.Assistant,
      SYSTEM: ChatCompletionRequestMessageRoleEnum.System
    };
    const formatPrompts: ChatCompletionRequestMessage[] = filterPrompts.map(
      (item: ChatItemType) => ({
        role: map[item.obj],
        content: item.value
      })
    );
    // console.log(formatPrompts);
    // 计算温度
    const temperature = modelConstantsData.maxTemperature * (model.temperature / 10);

    // 发出请求
    const chatResponse = await chatAPI.createChatCompletion(
      {
        model: model.service.chatModel,
        temperature: temperature,
        // max_tokens: modelConstantsData.maxToken,
        messages: formatPrompts,
        frequency_penalty: 0.5, // 越大，重复内容越少
        presence_penalty: -0.5, // 越大，越容易出现新内容
        stream: true
      },
      {
        timeout: 40000,
        responseType: 'stream',
        httpsAgent
      }
    );

    console.log('api response. time:', `${(Date.now() - startTime) / 1000}s`);

    step = 1;
    const { responseContent } = await gpt35StreamResponse({
      res,
      stream,
      chatResponse
    });
    console.log('response done. time:', `${(Date.now() - startTime) / 1000}s`);

    const promptsContent = formatPrompts.map((item) => item.content).join('');
    // 只有使用平台的 key 才计费
    pushChatBill({
      isPay: !userApiKey,
      modelName: model.service.modelName,
      userId,
      text: promptsContent + responseContent
    });
  } catch (err: any) {
    if (step === 1) {
      // 直接结束流
      console.log('error，结束');
      stream.destroy();
    } else {
      res.status(500);
      jsonRes(res, {
        code: 500,
        error: err
      });
    }
  }
}
