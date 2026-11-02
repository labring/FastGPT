import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { getQuoteTemplate } from '@fastgpt/global/core/ai/prompt/AIChat';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import { getHistoryPreview } from '@fastgpt/global/core/chat/utils';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { workflowSseEvent } from '@fastgpt/global/core/workflow/runtime/sse';

import { formatModelChars2Points } from '../../../../../support/wallet/usage/utils';
import { createLLMResponse } from '../../../../ai/llm/request';
import { computedMaxToken } from '../../../../ai/utils';
import { postTextCensor } from '../../../../chat/postTextCensor';
import { getWorkflowFileContext, getWorkflowFileMaxAmount } from '../../../utils/context';
import { loadWorkflowModelResource } from '../../../resource/service';
import { checkQuoteQAValue, getHistories, getNodeErrResponse } from '../../utils';
import { getChatMessages } from './chatMessages';
import { getDatasetCiteData } from './datasetCite';
import { getAIChatFileContextConfig, getInputFiles } from './fileContext';
import type { ChatProps, ChatResponse } from './type';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import type { LLMResponse } from '../../../../ai/llm/request/types';
import {
  createYuanbaoWebSearchTool,
  executeYuanbaoWebSearchTool,
  YUANBAO_WEB_SEARCH_TOOL_LABEL,
  YUANBAO_WEB_SEARCH_TOOL_NAME
} from '../../../../ai/webSearch/tool';

/**
 * 调度 AI Chat 节点：整理引用、历史和文件上下文，调用 LLM，并写入节点响应与用量。
 */
export const dispatchChatCompletion = async (props: ChatProps): Promise<ChatResponse> => {
  const {
    checkIsStopping,
    requestOrigin,
    stream = false,
    retainDatasetCite = true,
    externalProvider,
    histories,
    node: { name, version, inputs },
    runningUserInfo,
    runningAppInfo,
    workflowStreamResponse,
    chatConfig,
    usageId,
    params: {
      modelId,
      model,
      temperature,
      maxToken,
      history = 6,
      userChatInput: rawUserChatInput = '',
      isResponseAnswerText = true,
      systemPrompt = '',
      aiChatQuoteRole = 'system',
      quoteTemplate,
      quotePrompt,
      aiChatReasoning = true,
      aiChatReasoningEffort,
      aiChatTopP,
      aiChatStopSign,
      aiChatResponseFormat,
      aiChatJsonSchema,
      enableWebSearch = false,

      quoteQA: rawQuoteQA,
      aiChatVision: rawAiChatVision,
      aiChatAudio: rawAiChatAudio,
      aiChatVideo: rawAiChatVideo,
      aiChatExtractFiles,
      fileUrlList: rawFileLinks // node quote file links
    }
  } = props;
  let quoteQA = rawQuoteQA;
  let aiChatVision = rawAiChatVision;
  let aiChatAudio = rawAiChatAudio;
  let aiChatVideo = rawAiChatVideo;
  let fileLinks = rawFileLinks;
  let userChatInput = rawUserChatInput;
  const modelConstantsData = await loadWorkflowModelResource({
    appTeamId: runningAppInfo.teamId,
    userInfo: runningUserInfo,
    modelId,
    model
  });

  try {
    aiChatVision = modelConstantsData.config.vision && aiChatVision;
    aiChatAudio = modelConstantsData.config.audio && aiChatAudio;
    aiChatVideo = modelConstantsData.config.video && aiChatVideo;
    const fileContextConfig = getAIChatFileContextConfig({ inputs, rawFileLinks });
    fileLinks = fileContextConfig.fileLinks;

    const chatHistories = getHistories(history, histories);
    quoteQA = checkQuoteQAValue(quoteQA);

    const [datasetCiteData, userFiles] = await Promise.all([
      getDatasetCiteData({
        quoteQA,
        model: modelConstantsData,
        quoteTemplate: quoteTemplate || getQuoteTemplate(version),
        aiChatQuoteRole,
        datasetQuotePrompt: quotePrompt,
        userChatInput,
        version,
        useDatasetQuote: quoteQA !== undefined
      }),
      getInputFiles({
        fileLinks
      })
    ]);
    userChatInput = datasetCiteData.userInput;

    if (!userChatInput && userFiles.length === 0) {
      return getNodeErrResponse({ error: i18nT('chat:AI_input_is_empty') });
    }

    const max_tokens = computedMaxToken({
      model: modelConstantsData,
      maxToken
    });

    const [filterMessages] = await Promise.all([
      getChatMessages({
        model: modelConstantsData,
        maxTokens: max_tokens,
        histories: chatHistories,
        datasetCiteSystemPrompt: datasetCiteData.systemPrompt,
        systemPrompt,
        userChatInput,
        userFiles,
        parseHistoryFiles: fileContextConfig.parseHistoryFiles,
        maxFileAmount: getWorkflowFileMaxAmount(),
        customPdfParse: chatConfig?.fileSelectConfig?.customPdfParse,
        usageId,
        runningUserInfo
      }),
      (() => {
        if (modelConstantsData.config.censor && !externalProvider.openaiAccount?.key) {
          return postTextCensor({
            text: `${systemPrompt}
            ${userChatInput}
          `
          });
        }
      })()
    ]);

    const requestStartTime = Date.now();
    let firstTokenTime: number | undefined; // 首个模型输出 token 到达时刻(含思考)

    // 最多执行 3 次搜索工具轮次，最后一次请求强制仅生成回答，避免模型无限搜索。
    const webSearchEnabled = enableWebSearch === true;
    const toolCallMode = modelConstantsData.config.toolChoice ? 'toolChoice' : 'prompt';
    const maxSearchRounds = webSearchEnabled ? 3 : 0;
    let modelMessages: ChatCompletionMessageParam[] = filterMessages;
    const responses: LLMResponse[] = [];
    let searchCalls = 0;
    for (let round = 0; round <= maxSearchRounds; round++) {
      const allowSearch = webSearchEnabled && round < maxSearchRounds;
      const current = await createLLMResponse({
        throwError: false,
        fileContext: getWorkflowFileContext(),
        body: {
          model: modelConstantsData,
          stream,
          messages: modelMessages,
          temperature,
          max_tokens,
          top_p: aiChatTopP,
          stop: aiChatStopSign,
          reasoning_effort: aiChatReasoningEffort,
          response_format: {
            type: aiChatResponseFormat,
            json_schema: aiChatJsonSchema
          },
          retainDatasetCite,
          useVision: aiChatVision,
          useAudio: aiChatAudio,
          useVideo: aiChatVideo,
          extractFiles: aiChatExtractFiles,
          requestOrigin,
          ...(webSearchEnabled
            ? {
                tools:
                  allowSearch || toolCallMode === 'toolChoice'
                    ? [createYuanbaoWebSearchTool()]
                    : undefined,
                toolCallMode,
                tool_choice: allowSearch ? ('auto' as const) : ('none' as const),
                parallel_tool_calls: false
              }
            : {})
        },
        userKey: externalProvider.openaiAccount,
        teamId: runningUserInfo.teamId,
        isAborted: checkIsStopping,
        onReasoning({ text }) {
          firstTokenTime ??= Date.now();
          if (!aiChatReasoning) return;
          workflowStreamResponse?.(workflowSseEvent.reasoningDelta(text));
        },
        onStreaming({ text }) {
          firstTokenTime ??= Date.now();
          if (!isResponseAnswerText) return;
          workflowStreamResponse?.(workflowSseEvent.answerDelta(text));
        }
      });
      responses.push(current);
      if (current.error || current.responseEmptyTip || !allowSearch || !current.toolCalls?.length) {
        break;
      }

      modelMessages = [...current.completeMessages];
      for (const call of current.toolCalls) {
        const result = await (async () => {
          if (call.function.name !== YUANBAO_WEB_SEARCH_TOOL_NAME) {
            return { response: 'Tool error: Unknown tool' };
          }
          if (searchCalls >= 3) {
            return { response: 'Tool error: Search limit reached' };
          }
          searchCalls++;
          return executeYuanbaoWebSearchTool({ call, checkIsStopping });
        })();
        modelMessages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: result.response
        });
      }
    }
    const finalResponse = responses[responses.length - 1];
    const { finish_reason, responseEmptyTip, error } = finalResponse;
    const completeMessages =
      webSearchEnabled && responses.length > 1
        ? [
            ...modelMessages,
            ...(finalResponse.completeMessages.length > modelMessages.length
              ? finalResponse.completeMessages.slice(modelMessages.length)
              : [{ role: 'assistant' as const, content: finalResponse.answerText }])
          ]
        : finalResponse.completeMessages;
    const answerText = webSearchEnabled
      ? responses.map((item) => item.answerText).join('')
      : finalResponse.answerText;
    const reasoningText = responses
      .map((item) => item.reasoningText)
      .filter(Boolean)
      .join('\n');
    const usage = {
      inputTokens: responses.reduce((sum, item) => sum + item.usage.inputTokens, 0),
      outputTokens: responses.reduce((sum, item) => sum + item.usage.outputTokens, 0),
      usedUserOpenAIKey: responses.some((item) => item.usage.usedUserOpenAIKey)
    };
    const requestIds = responses.map((item) => item.requestId);
    const firstTokenTimeSec =
      firstTokenTime === undefined
        ? undefined
        : +((firstTokenTime - requestStartTime) / 1000).toFixed(2);

    // 每次模型调用独立计价，避免多轮搜索时阶梯价格与真实请求不一致。
    const points = responses.reduce((sum, item) => {
      if (item.usage.usedUserOpenAIKey) return sum;
      return (
        sum +
        formatModelChars2Points({
          model: modelConstantsData,
          inputTokens: item.usage.inputTokens,
          outputTokens: item.usage.outputTokens
        }).totalPoints
      );
    }, 0);
    if (!responseEmptyTip || responses.length > 1) {
      props.usagePush([
        {
          moduleName: name,
          totalPoints: points,
          modelId: modelConstantsData.modelId,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens
        }
      ]);
    }

    const chatCompleteMessages = GPTMessages2Chats({
      messages: completeMessages,
      getToolInfo: (name) =>
        name === YUANBAO_WEB_SEARCH_TOOL_NAME ? { name: YUANBAO_WEB_SEARCH_TOOL_LABEL } : undefined
    });

    if (responseEmptyTip || error) {
      return getNodeErrResponse({
        error: responseEmptyTip || error,
        responseData: {
          totalPoints: points,
          model: modelConstantsData.name,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          query: `${userChatInput}`,
          maxToken: max_tokens,
          reasoningText,
          historyPreview: getHistoryPreview(chatCompleteMessages, 10000, aiChatVision),
          contextTotalLen: completeMessages.length,
          finishReason: finish_reason,
          llmRequestIds: requestIds, // 记录每轮 LLM 请求追踪 ID
          firstTokenTime: firstTokenTimeSec
        }
      });
    }

    return {
      data: {
        answerText: answerText,
        reasoningText,
        history: chatCompleteMessages
      },
      [DispatchNodeResponseKeyEnum.answerText]: isResponseAnswerText ? answerText : undefined,
      [DispatchNodeResponseKeyEnum.reasoningText]: aiChatReasoning ? reasoningText : undefined,

      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        totalPoints: points,
        model: modelConstantsData.name,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        query: `${userChatInput}`,
        maxToken: max_tokens,
        reasoningText,
        historyPreview: getHistoryPreview(chatCompleteMessages, 10000, aiChatVision),
        contextTotalLen: completeMessages.length,
        finishReason: finish_reason,
        llmRequestIds: requestIds, // 记录每轮 LLM 请求追踪 ID
        firstTokenTime: firstTokenTimeSec
      },
      [DispatchNodeResponseKeyEnum.toolResponse]: answerText
    };
  } catch (error) {
    return getNodeErrResponse({ error });
  }
};
