import { NextAPI } from '@/service/middleware/entry';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  OptimizeCodeBodySchema,
  OptimizeCodeResponseSchema,
  type OptimizeCodeBody
} from '@fastgpt/global/openapi/core/workflow/api';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { responseWrite } from '@fastgpt/service/common/response';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { createLLMResponse } from '@fastgpt/service/core/ai/llm/request';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { assertAuthModels } from '@fastgpt/service/support/permission/model/auth';
import { createUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { formatModelChars2Points } from '@fastgpt/service/support/wallet/usage/utils';

const logger = getLogger(LogCategories.MODULE.WORKFLOW.OPTIMIZE_CODE);

const getPromptNodeCopilotSystemPrompt = () => {
  return `
## 角色
你是一个算法专家，精通Python/JavaScript语法规范与最佳实践，能够快速解析用户需求并转化为最小可行算法

## 强制约束
  - 用 Markdown 的代码块格式输出代码
  - 函数名始终为 main，每次只生成一段完整代码，代码块中间不要包含其他内容
  - 函数必须接收一个对象作为参数，对象包含所有业务输入参数，例如：main({name, age})
  - 代码必须返回对象格式的结果，例如：计算 a+b 的结果应该返回 {result: a+b}
  
## 注释格式规范
- 必须在函数开头添加完整的JSDoc注释
- 对每个实际业务参数使用 @param {类型} key [变量引用] - 参数描述
    - key 必须与 main 函数使用的参数 key 完全一致；已有输入参数沿用给定的 key，不得翻译或改写
    - 变量引用格式：[nodeId.outputKey] 表示该参数来源于哪个节点的哪个输出
    - 参数描述应该说明该参数的业务含义
    - 参数名不可以是嵌套的，例如：paramName.a.b
    - 注意参数的数据类型
- 对返回对象的每个属性使用 @property {类型} key - 属性描述
    - @property 的 key 必须与 return 对象中的 key 完全一致；已有输出参数沿用给定的 key，不得翻译或改写
    - 业务说明只写在描述中，不作为参数 key
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

## 重要说明
当用户提及 {paramName, paramRefer, paramType} 时，这些是系统内部的变量描述信息，用于帮助你理解参数：
- paramName：参数实际的 key（如：userName），直接作为 main 的参数 key
- paramRefer：显示变量来源引用（如：nodeId.outputKey）  
- paramType：显示参数的数据类型
使用 paramName 的值作为业务参数 key，并将 paramRefer 写入 @param 的变量引用；不要把元数据字段名 paramName/paramRefer/paramType 当作参数名。

## 正确示例：
用户需求：处理用户信息，参数包含 {paramName: "userName", paramRefer: "node123.userName", paramType: "string"}

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

## 错误示例（禁止）
\`\`\`javascript
// 错误：不要直接使用paramName, paramRefer, paramType作为函数参数
function main({paramName, paramRefer, paramType}) {
// 这是错误的！
}
\`\`\`
`;
};

async function handler(req: ApiRequestProps<OptimizeCodeBody>, res: ApiResponseType) {
  const {
    optimizerInput,
    modelId,
    conversationHistory = []
  } = parseApiInput({
    req,
    bodySchema: OptimizeCodeBodySchema
  }).body;

  try {
    const { teamId, tmbId, isRoot } = await authCert({
      req,
      authToken: true,
      authApiKey: true
    });
    const {
      models: [modelData]
    } = await assertAuthModels({
      actor: { teamId, tmbId, isRoot },
      modelIds: [modelId],
      type: ModelTypeEnum.llm
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
        content: optimizerInput
      }
    ];

    const llmResponse = await createLLMResponse({
      teamId,
      saveLLMResponseRecord: false,
      body: {
        model: modelData,
        messages,
        stream: true,
        useVision: false
      },
      onStreaming: ({ text }) => {
        responseWrite({
          res,
          event: SseResponseEventEnum.answer,
          data: OptimizeCodeResponseSchema.parse(
            JSON.stringify({
              choices: [
                {
                  delta: {
                    content: text
                  }
                }
              ]
            })
          )
        });
      }
    });

    const { inputTokens, outputTokens } = llmResponse.usage;
    responseWrite({
      res,
      event: SseResponseEventEnum.answer,
      data: OptimizeCodeResponseSchema.parse('[DONE]')
    });

    const { totalPoints } = formatModelChars2Points({
      model: modelData,
      inputTokens,
      outputTokens
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
          modelId: modelData.modelId,
          inputTokens,
          outputTokens
        }
      ]
    });
  } catch (error) {
    logger.error('Failed to optimize workflow code', { error });
  }
  res.end();
}

export default NextAPI(handler);
