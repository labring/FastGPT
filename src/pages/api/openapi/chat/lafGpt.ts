import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { authOpenApiKey, authModel, getApiKey } from '@/service/utils/auth';
import { resStreamResponse, modelServiceToolMap } from '@/service/utils/chat';
import { ChatItemSimpleType } from '@/types/chat';
import { jsonRes } from '@/service/response';
import { PassThrough } from 'stream';
import { ChatModelMap, ModelVectorSearchModeMap } from '@/constants/model';
import { pushChatBill } from '@/service/events/pushBill';
import { searchKb } from '@/service/plugins/searchKb';
import { ChatRoleEnum } from '@/constants/chat';

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
    const { userId } = await authOpenApiKey(req);

    /* 查找数据库里的模型信息 */
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

    console.log('laf gpt start');

    // 请求一次 chatgpt 拆解需求
    const { responseText: resolveText, totalTokens: resolveTokens } = await modelServiceToolMap[
      model.chat.chatModel
    ].chatCompletion({
      apiKey,
      temperature: 0,
      messages: [
        {
          obj: ChatRoleEnum.System,
          value: `服务端逻辑生成器.根据用户输入的需求,拆解成 laf 云函数实现的步骤,只返回步骤,按格式返回步骤: 1.\n2.\n3.\n ......
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
          obj: ChatRoleEnum.Human,
          value: prompt.value
        }
      ],
      stream: false
    });

    prompt.value += ` ${resolveText}`;
    console.log('prompt resolve success, time:', `${(Date.now() - startTime) / 1000}s`);

    // 读取对话内容
    const prompts = [prompt];

    // 获取向量匹配到的提示词
    const { searchPrompt } = await searchKb({
      similarity: ModelVectorSearchModeMap[model.chat.searchMode]?.similarity,
      prompts,
      model,
      userId
    });

    searchPrompt && prompts.unshift(searchPrompt);

    // 计算温度
    const temperature = (modelConstantsData.maxTemperature * (model.chat.temperature / 10)).toFixed(
      2
    );

    // 发出请求
    const { streamResponse, responseMessages, responseText, totalTokens } =
      await modelServiceToolMap[model.chat.chatModel].chatCompletion({
        apiKey,
        temperature: +temperature,
        messages: prompts,
        stream: isStream
      });

    console.log('api response time:', `${(Date.now() - startTime) / 1000}s`);

    let textLen = resolveText.length;
    let tokens = resolveTokens;

    if (isStream) {
      step = 1;
      const { finishMessages, totalTokens } = await resStreamResponse({
        model: model.chat.chatModel,
        res,
        stream,
        chatResponse: streamResponse,
        prompts
      });
      textLen += finishMessages.map((item) => item.value).join('').length;
      tokens += totalTokens;
    } else {
      textLen += responseMessages.map((item) => item.value).join('').length;
      tokens += totalTokens;
      jsonRes(res, {
        data: responseText
      });
    }

    console.log('laf gpt done. time:', `${(Date.now() - startTime) / 1000}s`);

    pushChatBill({
      isPay: true,
      chatModel: model.chat.chatModel,
      userId,
      textLen,
      tokens
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
