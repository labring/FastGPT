import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { getQuoteTemplate } from '@fastgpt/global/core/ai/prompt/AIChat';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import { getHistoryPreview } from '@fastgpt/global/core/chat/utils';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { workflowSseEvent } from '@fastgpt/global/core/workflow/runtime/sse';
import { getLLMModel } from '../../../../ai/model';
import { createLLMResponse } from '../../../../ai/llm/request';
import { computedMaxToken } from '../../../../ai/utils';
import { postTextCensor } from '../../../../chat/postTextCensor';
import { formatModelChars2Points } from '../../../../../support/wallet/usage/utils';
import { checkQuoteQAValue, getHistories, getNodeErrResponse } from '../../utils';
import { getChatMessages } from './chatMessages';
import { getDatasetCiteData } from './datasetCite';
import { getAIChatFileContextConfig, getInputFiles } from './fileContext';
import type { ChatProps, ChatResponse } from './type';

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
    workflowStreamResponse,
    chatConfig,
    usageId,
    params: {
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

  const modelConstantsData = getLLMModel(model);
  if (!modelConstantsData) {
    return getNodeErrResponse({
      error: `Model ${model} is undefined, you need to select a chat model.`
    });
  }

  try {
    aiChatVision = modelConstantsData.vision && aiChatVision;
    aiChatAudio = modelConstantsData.audio && aiChatAudio;
    aiChatVideo = modelConstantsData.video && aiChatVideo;
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
        maxFileAmount: chatConfig?.fileSelectConfig?.maxFiles ?? 20,
        customPdfParse: chatConfig?.fileSelectConfig?.customPdfParse,
        usageId,
        runningUserInfo
      }),
      (() => {
        if (modelConstantsData.censor && !externalProvider.openaiAccount?.key) {
          return postTextCensor({
            text: `${systemPrompt}
            ${userChatInput}
          `
          });
        }
      })()
    ]);

    const {
      completeMessages,
      reasoningText,
      answerText,
      finish_reason,
      responseEmptyTip,
      usage,
      error,
      requestId // 获取请求追踪 ID
    } = await createLLMResponse({
      throwError: false,
      body: {
        model: modelConstantsData.model,
        stream,
        messages: filterMessages,
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
        requestOrigin
      },
      userKey: externalProvider.openaiAccount,
      teamId: runningUserInfo.teamId,
      isAborted: checkIsStopping,
      onReasoning({ text }) {
        if (!aiChatReasoning) return;
        workflowStreamResponse?.(workflowSseEvent.reasoningDelta(text));
      },
      onStreaming({ text }) {
        if (!isResponseAnswerText) return;
        workflowStreamResponse?.(workflowSseEvent.answerDelta(text));
      }
    });

    if (responseEmptyTip) {
      return getNodeErrResponse({ error: responseEmptyTip });
    }

    const { totalPoints, modelName } = formatModelChars2Points({
      model: modelConstantsData.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens
    });
    const points = usage.usedUserOpenAIKey ? 0 : totalPoints;
    props.usagePush([
      {
        moduleName: name,
        totalPoints: points,
        model: modelName,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens
      }
    ]);

    const chatCompleteMessages = GPTMessages2Chats({ messages: completeMessages });

    if (error) {
      return getNodeErrResponse({
        error,
        responseData: {
          totalPoints: points,
          model: modelName,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          query: `${userChatInput}`,
          maxToken: max_tokens,
          reasoningText,
          historyPreview: getHistoryPreview(chatCompleteMessages, 10000, aiChatVision),
          contextTotalLen: completeMessages.length,
          finishReason: finish_reason,
          llmRequestIds: [requestId] // 记录 LLM 请求追踪 ID
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
        model: modelName,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        query: `${userChatInput}`,
        maxToken: max_tokens,
        reasoningText,
        historyPreview: getHistoryPreview(chatCompleteMessages, 10000, aiChatVision),
        contextTotalLen: completeMessages.length,
        finishReason: finish_reason,
        llmRequestIds: [requestId] // 记录 LLM 请求追踪 ID
      },
      [DispatchNodeResponseKeyEnum.toolResponse]: answerText
    };
  } catch (error) {
    return getNodeErrResponse({ error });
  }
};
