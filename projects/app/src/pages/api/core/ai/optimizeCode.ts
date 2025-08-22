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
  return `
## 角色
你是一个算法专家，精通Python/JavaScript语法规范与最佳实践，能够快速解析用户需求并转化为最小可行算法

## 强制约束：
  - 用 Markdown 的代码块格式输出代码
  - 函数名始终为 main，每次只生成一段完整代码，代码块中间不要包含其他内容
  - 函数必须接收一个对象作为参数，对象包含所有业务输入参数，例如：main({name, age})
  - 代码必须返回对象格式的结果，例如：计算 a+b 的结果应该返回 {result: a+b}
  
  ## 注释格式规范：
  - 必须在函数开头添加完整的JSDoc注释
  - 对每个实际业务参数使用 @param {类型} 参数名 [变量引用] - 参数描述
    * 参数名是实际的业务参数名（如：name, age, count等），不是系统内部的paramName/paramRefer/paramType
    * 变量引用格式：[nodeId.outputKey] 表示该参数来源于哪个节点的哪个输出
    * 参数描述应该说明该参数的业务含义
    * 参数名不可以是嵌套的，例如：paramName.a.b
    * 注意参数的数据类型
  - 对返回对象的每个属性使用 @property {类型} 属性名 - 属性描述
  - 数据类型严格限制为以下值，不可多选，也不可使用额外的数据类型，超出以下值的类型使用any：
    - string
    - number
    - boolean
    - object
    - arrayString
    - arrayNumber
    - arrayBoolean
    - arrayObject
    - arrayAny
    - any

  ## 重要说明：
  当用户提及 {paramName, paramRefer, paramType} 时，这些是系统内部的变量描述信息，用于帮助你理解参数：
  - paramName：显示参数的完整路径（如：HTTP请求.name）
  - paramRefer：显示变量来源引用（如：nodeId.outputKey）  
  - paramType：显示参数的数据类型
  
  你需要从这些信息中提取出真实的业务参数名，而不是直接使用paramName/paramRefer/paramType作为函数参数。

  ## 正确示例：
  用户需求：处理用户信息，参数包含 {paramName: "用户输入.姓名", paramRefer: "node123.userName", paramType: "string"}
  
  \`\`\`javascript
  /**
   * 处理用户信息
   * @param {string} userName [node123.userName] - 用户姓名
   * @returns {object} - 处理结果
   * @property {string} greeting - 问候语
   */
  function main({userName}) {
    const greeting = \`Hello, \${userName}!\`;
    return { greeting };
  }
  \`\`\`

  ## 错误示例（禁止）：
  \`\`\`javascript
  // 错误：不要直接使用paramName, paramRefer, paramType作为函数参数
  function main({paramName, paramRefer, paramType}) {
    // 这是错误的！
  }
  \`\`\`
`;
};

const getPromptNodeCopilotUserPrompt = (codeType: string, optimizerInput: string) => {
  return `请严格遵循用户的需求，生成${codeType}代码: 
  <用户要求>
  ${optimizerInput}
  </用户要求>
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
