import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Data } from '@/service/mongo';
import { getOpenAIApi } from '@/service/utils/chat';
import { httpsAgent, getOpenApiKey } from '@/service/utils/tools';
import type { ChatCompletionRequestMessage, CreateChatCompletionResponse } from 'openai';
import fs from 'fs';
import { v4 } from 'uuid';

/* 定时删除那些不活跃的内容 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const systemPrompt: ChatCompletionRequestMessage = {
    role: 'system',
    content: `总结助手。我会向你发送一段长文本，请从中总结出10个以上问题和答案，并转化成中文！请按以下格式返回：
"Q1:"
"A1:"
######
"Q2:"
"A2:"
######
`
  };

  try {
    const { text } = req.body as { text: string };
    const { authorization } = req.headers;
    const replaceText = text.replace(/\n/g, ' ');
    await connectToDatabase();

    const { userId, userApiKey, systemKey } = await getOpenApiKey(authorization);

    const chatAPI = getOpenAIApi(userApiKey || systemKey);

    const docId = v4();

    const queue: {
      requestPrompts: ChatCompletionRequestMessage;
      temperature: number;
    }[] = [
      {
        requestPrompts: {
          role: 'user',
          content: `跟 AI ChatGPT 聊了 11 个我过去关心的话题\n原创 刘飞Lufy 刘言飞语 2022-12-05 21:40 发表于浙江\n收录于合集\n#行业观察\n33\n个\n#AIGC\n11\n个\n\n\n\n\n这几天沉浸式体验 ChatGPT（OpenAI发布的一款人工智能对话引擎），突发奇想，想知道它对我曾经聊的话题都怎么看。于是我用一些过去公众号发过的文章主题，跟它进行了一轮对话。\n\n以下是我们聊天的内容原始记录，没有做文字篡改，为方便没有用截图，做了文本排版。各位可以直观体会下它的智能程度。\n\n\n（本文内容都是在以上这样的界面里完成的）\n\n\n——\n\n参考：微信搜索的未来\n\n刘飞：\n\n微信搜索现在的使用量大吗？\n\nChatGPT：\n\n微信搜索是一项非常流行的功能，它可以帮助用户快速搜索到想要的信息。由于微信是中国最流行的社交软件，微信搜索的使用量也非常大。根据官方数据，截至2022年，微信的日活跃用户数量已经超过10亿，其中，每天都会有大量用户使用微信搜索功能搜索各种信息。因此，微信搜索的使用量非常大。\n\n刘飞：\n\n跟百度搜索比呢？\n\nChatGPT：\n\n微信搜索和百度搜索都是帮助用户快速搜索到想要的信息的工具。但是，两者有着明显的不同。\n\n首先，微信搜索和百度搜索的使用场景不同。微信搜索主要用于社交场景，因此，它更多地用于搜索好友、群聊、文章等信息，而百度搜索则更加注重为用户提供更丰富的信息，因此它更多地用于搜索各种知识信息和新闻信息。\n\n\n其次，微信搜索和百度搜索的搜索结果也不同。微信搜索的搜索结果主要是来自用户自己的微信聊天记录和朋友圈发布的信息，而百度搜索的搜索结果则是来自互联网上的各种信息，包括网站、新闻、论坛等。因此，微信搜索的搜索结果更加个性化，而百度搜索的搜索结果则更加全面。\n\n总之，微信搜索和百度搜索都是帮助用户快速搜索到想要的信息的工具，但是它们在使用场景、搜索结果等方面存在明显的差异。\n\n刘飞：\n\n那字节跳动的搜索跟它们相比呢？\n\nChatGPT：\n\n字节跳动的搜索也是一款帮助用户快速搜索到想要的信息的工具。但是，字节跳动的搜索主要是针对短视频内容而设计的，因此，它的搜索结果主要是来自抖音、头条等短视频平台上的视频内容。与微信搜索和百度搜索相比，字节跳动的搜索更加专注于短视频内容，并且搜索结果也更加丰富多样。\n\n——\n\n\n参考：我们离财务自由的距离\n\n\n刘飞：\n\n怎样才算财务自由？\n\nChatGPT：\n\n财务自由是指一个人在不必工作的情况下，能够通过自己的财富维持生活的质量和生活水平。通常情况下，一个人可以通过节约开支、投资理财等方式来实现财务自由。\n\n具体来说，要达到财务自由，一个人需要符合以下几个条件：\n\n\n实现收入和支出平衡。要想实现财务自由，首先需要通过节约开支来控制支出，并通过提高收入来提升生活水平。\n\n\n建立良好的投资理财计划。要想实现财务自由，需要通过投资理财来增加财富的增长速度，并且要有一个完善的理财计划来指导投资决策。\n\n\n控制风险。在投资理财的过程中，要尽量降低风险，并通过多样化投资来降低投资的风险。`
        },
        temperature: 0.5
      }
    ];

    /**
     * 生成QA
     */
    const generateQA = async () => {
      const prompt = queue.pop();
      if (!prompt) return;

      try {
        const response = await chatAPI.createChatCompletion(
          {
            model: 'gpt-3.5-turbo',
            temperature: prompt.temperature,
            n: 1,
            messages: [systemPrompt, prompt.requestPrompts]
          },
          {
            timeout: 60000,
            httpsAgent
          }
        );
        return response.data.choices[0].message?.content;
      } catch (error) {
        console.log('部分训练出现错误');
      }
    };
    // 格式化文本长度
    // for (let i = 0; i <= replaceText.length / 2048; i++) {
    //   const slicePrompts: ChatCompletionRequestMessage = {
    //     role: 'user',
    //     content: replaceText.slice(i * 2048, (i + 1) * 2048)
    //   };

    //   [0.1, 0.3, 0.5, 0.7, 0.9].forEach((temperature) => {
    //     queue.push({
    //       temperature,
    //       requestPrompts: slicePrompts
    //     });
    //   });
    // }

    jsonRes(res, {
      data: await generateQA()
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}

/**
 * 检查文本是否按格式返回
 */
function splitText(text: string) {}
