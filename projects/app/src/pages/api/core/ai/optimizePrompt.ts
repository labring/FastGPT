import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { responseWrite } from '@fastgpt/service/common/response';
import { sseErrRes } from '@fastgpt/service/common/response';
import { createChatCompletion } from '@fastgpt/service/core/ai/config';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { loadRequestMessages } from '@fastgpt/service/core/chat/utils';
import { llmCompletionsBodyFormat } from '@fastgpt/service/core/ai/utils';
import {
  getPromptOptimizerSystemPrompt,
  getPromptOptimizerUserPrompt
} from '@fastgpt/global/core/ai/prompt/agent';
import { countGptMessagesTokens } from '@fastgpt/service/common/string/tiktoken/index';
import { formatModelChars2Points } from '@fastgpt/service/support/wallet/usage/utils';
import { createUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import { i18nT } from '@fastgpt/web/i18n/utils';

type OptimizePromptBody = {
  originalPrompt: string;
  optimizerInput: string;
  appId: string;
  model: string;
};

async function handler(req: ApiRequestProps<OptimizePromptBody>, res: ApiResponseType) {
  try {
    const { originalPrompt, optimizerInput, appId, model } = req.body;

    const { teamId, tmbId, app } = await authApp({
      req,
      authToken: true,
      appId,
      per: WritePermissionVal
    });

    res.setHeader('Content-Type', 'text/event-stream;charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
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

    if (!isStreamResponse) {
      throw new Error('Expected stream response');
    }

    let optimizedText = '';
    for await (const chunk of response) {
      if (chunk.choices?.[0]?.delta?.content) {
        const content = chunk.choices[0].delta.content;
        optimizedText += content;

        responseWrite({
          res,
          event: SseResponseEventEnum.fastAnswer,
          data: JSON.stringify({
            choices: [
              {
                delta: {
                  content: content
                }
              }
            ]
          })
        });
      }

      if (
        chunk.choices?.[0]?.finish_reason === 'stop' ||
        chunk.choices?.[0]?.finish_reason === 'length' ||
        chunk.choices?.[0]?.finish_reason
      ) {
        break;
      }
    }

    responseWrite({
      res,
      event: SseResponseEventEnum.answer,
      data: '[DONE]'
    });

    res.end();

    const inputTokens = await countGptMessagesTokens(requestMessages);
    const outputTokens = await countGptMessagesTokens([
      { role: 'assistant', content: optimizedText }
    ] as ChatCompletionMessageParam[]);

    const { totalPoints, modelName } = formatModelChars2Points({
      model,
      inputTokens,
      outputTokens,
      modelType: ModelTypeEnum.llm
    });

    await createUsage({
      teamId,
      tmbId,
      appName: `${app.name}`,
      appId: String(app._id),
      totalPoints,
      source: UsageSourceEnum.fastgpt,
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
    console.error('Optimize prompt error:', error);
    sseErrRes(res, error);
    try {
      res.end();
    } catch {}
    return;
  }
}

export default NextAPI(handler);
