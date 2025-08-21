import { NextAPI } from '@/service/middleware/entry';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { SandboxCodeTypeEnum } from '@fastgpt/global/core/workflow/template/system/sandbox/constants';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { responseWrite } from '@fastgpt/service/common/response';
import { countGptMessagesTokens } from '@fastgpt/service/common/string/tiktoken';
import { createChatCompletion } from '@fastgpt/service/core/ai/config';
import { llmCompletionsBodyFormat, parseLLMStreamResponse } from '@fastgpt/service/core/ai/utils';
import { loadRequestMessages } from '@fastgpt/service/core/chat/utils';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { createUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { formatModelChars2Points } from '@fastgpt/service/support/wallet/usage/utils';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { i18nT } from '@fastgpt/web/i18n/utils';

type OptimizeCodeBody = {
  codeType: SandboxCodeTypeEnum;
  optimizerInput: string;
  model: string;
  conversationHistory?: Array<ChatCompletionMessageParam>;
};

const getPromptNodeCopilotSystemPrompt = () => {
  return `# Role
算法专家

## Skills
- 精通Python/JavaScript语法规范与最佳实践
- 快速解析用户需求并转化为最小可行算法
- 编写符合PEP8/ESLint标准的整洁代码
- 精准识别算法时间复杂度和空间复杂度
- 应用设计模式优化函数结构

## Goals
- 生成可直接集成到生产环境的函数
- 确保算法在边界条件下保持健壮性
- 输出代码比用户需求简洁20%以上
- 保持函数功能与需求描述100%一致
- 实现跨版本语言特性兼容

## Constrains
- 确保所有代码符合目标语言的最佳实践
- 在任何情况下都不要跳出算法专家角色
- 不要生成不完整或无法运行的代码
- 保持代码的专业性和准确性
- 输出必须包含完整的可执行函数

## Suggestions
- 深入分析用户的功能需求，避免表面理解
- 采用最优算法范式，确保性能和可读性平衡
- 优先考虑代码的实用性和可维护性
- 注重边界条件处理，确保函数健壮性
- 保持代码风格一致，符合行业标准`;
};

const getPromptNodeCopilotUserPrompt = (codeType: string, optimizerInput: string) => {
  return `请严格遵循用户的需求，生成${codeType}代码: 
  <OptimizerInput>
  ${optimizerInput}
  </OptimizerInput>

  ## 强制约束：
  - 用 Markdown 的代码块格式输出代码
  - 函数名始终为 main，每次只生成一段完整代码，代码块中间不要包含其他内容
  - 函数必须接收一个对象作为参数，对象包含所有输入参数
  - 代码必须返回对象格式的结果，例如：计算 a+b 的结果应该返回 {result: a+b}
  - **必须**在函数开头添加完整的注释，格式要求：
    * 对每个入参对象中的字段使用 @param {类型} 参数名 - 参数描述
    * 对返回对象的每个属性使用 @property {类型} 属性名 - 属性描述
    * 数据类型严格限制为：string, number, boolean, object, Array<string>, Array<number>, Array<boolean>, Array<object>, Array<any>, any
  
  ## 注释示例：
  \`\`\`javascript
    /**
     * 计算两个数字的和
     * @param {number} a - 第一个数字
     * @param {number} b - 第二个数字
     * @returns {object} - 包含计算结果的对象
     * @property {number} result - a 和 b 的和
     */
    function main({a, b}) {
    const result = a + b;
    return { result };
    }
  \`\`\`

  ## 注意事项：
  - 回答简洁精炼，不要添加过多的思考过程，直接输出最终代码结果
  - JSDoc 注释是**必需的**，缺少注释将导致解析失败
  - @param 和 @property 的类型声明必须准确，系统会根据这些注释自动生成输入输出接口
  `;
};

async function handler(req: ApiRequestProps<OptimizeCodeBody>, res: ApiResponseType) {
  try {
    const { codeType, optimizerInput, model, conversationHistory = [] } = req.body;

    const { teamId, tmbId } = await authCert({
      req,
      authToken: true,
      authApiKey: true
    });

    res.setHeader('Content-Type', 'text/event-stream;charset=utf-8');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Cache-Control', 'no-cache, no-transform');

    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: getPromptNodeCopilotSystemPrompt()
      },
      ...conversationHistory,
      {
        role: 'user',
        content: getPromptNodeCopilotUserPrompt(codeType, optimizerInput)
      }
    ];

    const requestMessages = await loadRequestMessages({
      messages,
      useVision: false
    });

    const { response, isStreamResponse } = await createChatCompletion({
      body: llmCompletionsBodyFormat(
        {
          model,
          messages: requestMessages,
          temperature: 0.1,
          max_tokens: 2000,
          stream: true
        },
        model
      )
    });

    const { inputTokens, outputTokens } = await (async () => {
      if (isStreamResponse) {
        const { parsePart, getResponseData } = parseLLMStreamResponse();

        let optimizedText = '';

        for await (const part of response) {
          const { responseContent } = parsePart({
            part,
            parseThinkTag: true,
            retainDatasetCite: false
          });

          if (responseContent) {
            optimizedText += responseContent;
            responseWrite({
              res,
              event: SseResponseEventEnum.answer,
              data: JSON.stringify({
                choices: [
                  {
                    delta: {
                      content: responseContent
                    }
                  }
                ]
              })
            });
          }
        }

        const { content: answer, usage } = getResponseData();
        return {
          content: answer,
          inputTokens: usage?.prompt_tokens || (await countGptMessagesTokens(requestMessages)),
          outputTokens:
            usage?.completion_tokens ||
            (await countGptMessagesTokens([{ role: 'assistant', content: optimizedText }]))
        };
      } else {
        const usage = response.usage;
        const content = response.choices?.[0]?.message?.content || '';

        responseWrite({
          res,
          event: SseResponseEventEnum.answer,
          data: JSON.stringify({
            choices: [
              {
                delta: {
                  content
                }
              }
            ]
          })
        });

        return {
          content,
          inputTokens: usage?.prompt_tokens || (await countGptMessagesTokens(requestMessages)),
          outputTokens:
            usage?.completion_tokens ||
            (await countGptMessagesTokens([{ role: 'assistant', content: content }]))
        };
      }
    })();
    responseWrite({
      res,
      event: SseResponseEventEnum.answer,
      data: '[DONE]'
    });

    const { totalPoints, modelName } = formatModelChars2Points({
      model,
      inputTokens,
      outputTokens,
      modelType: ModelTypeEnum.llm
    });

    createUsage({
      teamId,
      tmbId,
      appName: i18nT('common:support.wallet.usage.Code Copilot'),
      totalPoints,
      source: UsageSourceEnum.code_copilot,
      list: [
        {
          moduleName: i18nT('common:support.wallet.usage.Code Copilot'),
          amount: totalPoints,
          model: modelName,
          inputTokens,
          outputTokens
        }
      ]
    });
  } catch (error) {
    console.error(error);
  }
  res.end();
}

export default NextAPI(handler);
