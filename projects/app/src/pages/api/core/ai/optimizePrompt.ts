import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { responseWrite } from '@fastgpt/service/common/response';
import { sseErrRes } from '@fastgpt/service/common/response';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { formatModelChars2Points } from '@fastgpt/service/support/wallet/usage/utils';
import { createUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import { i18nT } from '@fastgpt/web/i18n/utils';
import { addLog } from '@fastgpt/service/common/system/log';
import { createLLMResponse } from '@fastgpt/service/core/ai/llm/request';

type OptimizePromptBody = {
  originalPrompt: string;
  optimizerInput: string;
  model: string;
};

const getPromptOptimizerSystemPrompt = () => {
  return `# Role
Prompt工程师

## Skills
- 了解LLM的技术原理和局限性，包括它的训练数据、构建方式等，以便更好地设计Prompt
- 具有丰富的自然语言处理经验，能够设计出符合语法、语义的高质量Prompt
- 迭代优化能力强，能通过不断调整和测试Prompt的表现，持续改进Prompt质量
- 能结合具体业务需求设计Prompt，使LLM生成的内容符合业务要求
- 擅长分析用户需求，设计结构清晰、逻辑严谨的Prompt框架

## Goals
- 分析用户的Prompt，理解其核心需求和意图
- 设计一个结构清晰、符合逻辑的Prompt框架
- 生成高质量的结构化Prompt
- 提供针对性的优化建议

## Constrains
- 确保所有内容符合各个学科的最佳实践
- 在任何情况下都不要跳出角色
- 不要胡说八道和编造事实
- 保持专业性和准确性
- 输出必须包含优化建议部分

## Suggestions
- 深入分析用户原始Prompt的核心意图，避免表面理解
- 采用结构化思维，确保各个部分逻辑清晰且相互呼应
- 优先考虑实用性，生成的Prompt应该能够直接使用
- 注重细节完善，每个部分都要有具体且有价值的内容
- 保持专业水准，确保输出的Prompt符合行业最佳实践
- **特别注意**：Suggestions部分应该专注于角色内在的工作方法，而不是与用户互动的策略`;
};

const getPromptOptimizerUserPrompt = (originalPrompt: string, optimizerInput: string) => {
  return `请严格遵循用户的优化需求: 
<OptimizerInput>
${optimizerInput}
</OptimizerInput>

分析并优化以下Prompt，将其转化为结构化的高质量Prompt：
<OriginalPrompt>
${originalPrompt}
</OriginalPrompt>

## 注意事项：
- 直接输出优化后的Prompt，不要添加解释性文字，不要用代码块包围
- 每个部分都要有具体内容，不要使用占位符
- **数量要求**：Skills、Goals、Constrains、Workflow、Suggestions各部分需要5个要点，OutputFormat需要3个要点
- **Suggestions是给角色的内在工作方法论**，专注于角色自身的技能提升和工作优化方法，避免涉及与用户互动的建议
- **必须包含完整结构**：确保包含Role、Background、Attention、Profile、Skills、Goals、Constrains、Workflow、OutputFormat、Suggestions、Initialization等所有部分
- 保持内容的逻辑性和连贯性，各部分之间要相互呼应`;
};

async function handler(req: ApiRequestProps<OptimizePromptBody>, res: ApiResponseType) {
  try {
    const { originalPrompt, optimizerInput, model } = req.body;

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
        content: getPromptOptimizerSystemPrompt()
      },
      {
        role: 'user',
        content: getPromptOptimizerUserPrompt(originalPrompt, optimizerInput)
      }
    ];

    const {
      usage: { inputTokens, outputTokens }
    } = await createLLMResponse({
      body: {
        model,
        messages,
        temperature: 0.1,
        max_tokens: 2000,
        stream: true
      },
      onStreaming: ({ text }) => {
        responseWrite({
          res,
          event: SseResponseEventEnum.answer,
          data: JSON.stringify({
            choices: [
              {
                delta: {
                  content: text
                }
              }
            ]
          })
        });
      }
    });

    responseWrite({
      res,
      event: SseResponseEventEnum.answer,
      data: '[DONE]'
    });

    const { totalPoints, modelName } = formatModelChars2Points({
      model,
      inputTokens,
      outputTokens
    });

    createUsage({
      teamId,
      tmbId,
      appName: i18nT('common:support.wallet.usage.Optimize Prompt'),
      totalPoints,
      source: UsageSourceEnum.optimize_prompt,
      list: [
        {
          moduleName: i18nT('common:support.wallet.usage.Optimize Prompt'),
          amount: totalPoints,
          model: modelName,
          inputTokens,
          outputTokens
        }
      ]
    });
  } catch (error: any) {
    addLog.error('Optimize prompt error', error);
    sseErrRes(res, error);
  }
  res.end();
}

export default NextAPI(handler);
