import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase, Model } from '@/service/mongo';
import { getOpenAIApi, authOpenApiKey } from '@/service/utils/auth';
import { axiosConfig, openaiChatFilter, systemPromptFilter } from '@/service/utils/tools';
import { ChatItemSimpleType } from '@/types/chat';
import { jsonRes } from '@/service/response';
import { PassThrough } from 'stream';
import { modelList, ModelVectorSearchModeMap, ChatModelEnum } from '@/constants/model';
import { pushChatBill } from '@/service/events/pushBill';
import { gpt35StreamResponse } from '@/service/utils/openai';
import { searchKb_openai } from '@/service/tools/searchKb';

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
    const {
      prompt,
      modelId,
      isStream = true
    } = req.body as {
      prompt: ChatItemSimpleType;
      modelId: string;
      isStream: boolean;
    };

    if (!prompt || !modelId) {
      throw new Error('缺少参数');
    }

    await connectToDatabase();
    let startTime = Date.now();

    /* 凭证校验 */
    const { apiKey, userId } = await authOpenApiKey(req);

    /* 查找数据库里的模型信息 */
    const model = await Model.findById(modelId);
    if (!model) {
      throw new Error('找不到模型');
    }

    const modelConstantsData = modelList.find((item) => item.chatModel === model.chat.chatModel);
    if (!modelConstantsData) {
      throw new Error('model is undefined');
    }

    console.log('laf gpt start');

    // 获取 chatAPI
    const chatAPI = getOpenAIApi(apiKey);

    // 请求一次 chatgpt 拆解需求
    const promptResponse = await chatAPI.createChatCompletion(
      {
        model: ChatModelEnum.GPT35,
        temperature: 0,
        frequency_penalty: 0.5, // 越大，重复内容越少
        presence_penalty: -0.5, // 越大，越容易出现新内容
        messages: [
          {
            role: 'system',
            content: `服务端逻辑生成器.根据用户输入的需求,拆解成 laf 云函数实现的步骤,只返回步骤,按格式返回步骤: 1.\n2.\n3.\n ......
下面是一些例子:
一个 hello world 例子
1. 返回字符串: "hello world"

计算圆的面积
1. 从 body 中获取半径 radius.
2. 校验 radius 是否为有效的数字.
3. 计算圆的面积.
4. 返回圆的面积: {area} 

实现一个手机号发生注册验证码方法.
1. 从 query 中获取 phone.
2. 校验手机号格式是否正确,不正确则返回错误原因:手机号格式错误.
3. 给 phone 发送一个短信验证码,验证码长度为6位字符串,内容为:你正在注册laf,验证码为:code.
4. 数据库添加数据,表为"codes",内容为 {phone, code}.

实现一个云函数，使用手机号注册账号,需要验证手机验证码.
1. 从 body 中获取 phone 和 code.
2. 校验手机号格式是否正确,不正确则返回错误原因:手机号格式错误.
2. 获取数据库数据,表为"codes",查找是否有符合 phone, code 等于body参数的记录,没有的话返回错误原因:验证码不正确.
4. 添加数据库数据,表为"users" ,内容为{phone, code, createTime}.
5. 删除数据库数据,删除 code 记录.
6. 返回新建用户的Id: return {userId}

更新博客记录。传入blogId,blogText,tags,还需要记录更新的时间.
1. 从 body 中获取 blogId,blogText 和 tags.
2. 校验 blogId 是否为空,为空则返回错误原因:博客ID不能为空.
3. 校验 blogText 是否为空,为空则返回错误原因:博客内容不能为空.
4. 校验 tags 是否为数组,不是则返回错误原因:标签必须为数组.
5. 获取当前时间,记录为 updateTime.
6. 更新数据库数据,表为"blogs",更新符合 blogId 的记录的内容为{blogText, tags, updateTime}.
7. 返回结果 "更新博客记录成功"`
          },
          {
            role: 'user',
            content: prompt.value
          }
        ]
      },
      {
        timeout: 180000,
        ...axiosConfig()
      }
    );

    const promptResolve = promptResponse.data.choices?.[0]?.message?.content || '';
    if (!promptResolve) {
      throw new Error('gpt 异常');
    }

    prompt.value += ` ${promptResolve}`;
    console.log('prompt resolve success, time:', `${(Date.now() - startTime) / 1000}s`);

    // 读取对话内容
    const prompts = [prompt];

    // 获取向量匹配到的提示词
    const { searchPrompt } = await searchKb_openai({
      isPay: true,
      apiKey,
      similarity: ModelVectorSearchModeMap[model.chat.searchMode]?.similarity || 0.22,
      text: prompt.value,
      model,
      userId
    });

    searchPrompt && prompts.unshift(searchPrompt);

    // 控制上下文 tokens 数量，防止超出
    const filterPrompts = openaiChatFilter({
      model: model.chat.chatModel,
      prompts,
      maxTokens: modelConstantsData.contextMaxToken - 300
    });

    // console.log(filterPrompts);
    // 计算温度
    const temperature = (modelConstantsData.maxTemperature * (model.chat.temperature / 10)).toFixed(
      2
    );
    // 发出请求
    const chatResponse = await chatAPI.createChatCompletion(
      {
        model: model.chat.chatModel,
        temperature: Number(temperature) || 0,
        messages: filterPrompts,
        frequency_penalty: 0.5, // 越大，重复内容越少
        presence_penalty: -0.5, // 越大，越容易出现新内容
        stream: isStream
      },
      {
        timeout: 180000,
        responseType: isStream ? 'stream' : 'json',
        ...axiosConfig()
      }
    );

    let responseContent = '';

    if (isStream) {
      step = 1;
      const streamResponse = await gpt35StreamResponse({
        res,
        stream,
        chatResponse
      });
      responseContent = streamResponse.responseContent;
    } else {
      responseContent = chatResponse.data.choices?.[0]?.message?.content || '';
      jsonRes(res, {
        data: responseContent
      });
    }

    console.log('laf gpt done. time:', `${(Date.now() - startTime) / 1000}s`);

    pushChatBill({
      isPay: true,
      chatModel: model.chat.chatModel,
      userId,
      messages: filterPrompts.concat({ role: 'assistant', content: responseContent })
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
