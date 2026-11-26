import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { getQuoteTemplate } from '@fastgpt/global/core/ai/prompt/AIChat';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import { getHistoryPreview } from '@fastgpt/global/core/chat/utils';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { workflowSseEvent } from '@fastgpt/global/core/workflow/runtime/sse';

import { formatModelChars2Points } from '../../../../../support/wallet/usage/utils';
import { createLLMResponse } from '../../../../ai/llm/request';
import { computedMaxToken } from '../../../../ai/utils';
import { getWorkflowContext, getWorkflowFileContext } from '../../context';
import { loadWorkflowModelResource } from '../../../resource/service';
import { checkQuoteQAValue, getHistories, getNodeErrResponse } from '../../utils';
import { getDispatchModerationContext } from '../../utils/runtime';
import { getChatMessages } from './chatMessages';
import { getDatasetCiteData } from './datasetCite';
import { getAIChatFileContextConfig, getInputFiles } from './fileContext';
import type { ChatProps, ChatResponse } from './type';
import { checkModelContextModeration } from '../../../../plugin/moderation/modelInput';
import { MODERATION_BLOCKED_ERROR_MESSAGE } from '@fastgpt/global/core/plugin/moderation/constants';

/**
 * 调度 AI Chat 节点：整理引用、历史和文件上下文，调用 LLM，并写入节点响应与用量。
 */
export const dispatchChatCompletion = async (props: ChatProps): Promise<ChatResponse> => {
  const { fileContext, checkIsStopping, workflowStreamResponse } = getWorkflowContext();
  const {
    requestOrigin,
    stream = false,
    retainDatasetCite = true,
    externalProvider,
    histories,
    node: { name, version, inputs },
    runningAppInfo,
    runningUserInfo,
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
      systemPrompt: rawSystemPrompt = '',
      aiChatQuoteRole = 'user',
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
  const systemPrompt = rawSystemPrompt;
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

    // 同时校验原始输入与模板渲染结果：
    // 1) 避免 user 角色下默认引用模板的固定文案放行空问题且无附件的输入；
    // 2) 保留仅附件路径，以及自定义模板不含 {{question}} 且引用为空时的空消息拦截。
    if ((!rawUserChatInput || !userChatInput) && userFiles.length === 0) {
      return getNodeErrResponse({ error: i18nT('chat:AI_input_is_empty') });
    }

    const max_tokens = computedMaxToken({
      model: modelConstantsData,
      maxToken
    });

    const filterMessages = await getChatMessages({
      model: modelConstantsData,
      maxTokens: max_tokens,
      histories: chatHistories,
      datasetCiteSystemPrompt: datasetCiteData.systemPrompt,
      systemPrompt,
      userChatInput,
      userFiles,
      parseHistoryFiles: fileContextConfig.parseHistoryFiles,
      maxFileAmount: fileContext.limits.maxFileAmount,
      customPdfParse: chatConfig?.fileSelectConfig?.customPdfParse,
      usageId,
      runningUserInfo
    });

    // 锚点 2：对最终发给 AI 的本轮上下文（系统提示词 + 本轮用户消息，跳过历史消息）进行一次统一拦截，违规直接节点报错
    const contextCheck = await checkModelContextModeration({
      messages: filterMessages,
      context: getDispatchModerationContext(props)
    });
    if (contextCheck.isBlocked) {
      return getNodeErrResponse({
        error: contextCheck.blockErrorMessage || MODERATION_BLOCKED_ERROR_MESSAGE
      });
    }

    const requestStartTime = Date.now();
    let firstTokenTime: number | undefined; // 首个模型输出 token 到达时刻(含思考)

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
      fileContext: getWorkflowFileContext(),
      body: {
        model: modelConstantsData,
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
    if (responseEmptyTip) {
      return getNodeErrResponse({
        error: responseEmptyTip,
        responseData: {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheReadTokens: usage.cacheReadTokens,
          cacheCreationTokens: usage.cacheCreationTokens
        }
      });
    }

    const firstTokenTimeSec =
      firstTokenTime === undefined
        ? undefined
        : +((firstTokenTime - requestStartTime) / 1000).toFixed(2);

    const { totalPoints } = formatModelChars2Points({
      model: modelConstantsData,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheCreationTokens: usage.cacheCreationTokens
    });
    const points = usage.usedUserOpenAIKey ? 0 : totalPoints;
    props.usagePush([
      {
        moduleName: name,
        totalPoints: points,
        modelId: modelConstantsData.modelId,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens,
        cacheCreationTokens: usage.cacheCreationTokens
      }
    ]);

    const chatCompleteMessages = GPTMessages2Chats({ messages: completeMessages });

    if (error) {
      return getNodeErrResponse({
        error,
        responseData: {
          totalPoints: points,
          model: modelConstantsData.name,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheReadTokens: usage.cacheReadTokens,
          cacheCreationTokens: usage.cacheCreationTokens,
          query: `${userChatInput}`,
          maxToken: max_tokens,
          reasoningText,
          historyPreview: getHistoryPreview(chatCompleteMessages, 10000, aiChatVision),
          contextTotalLen: completeMessages.length,
          finishReason: finish_reason,
          llmRequestIds: [requestId], // 记录 LLM 请求追踪 ID
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
        cacheReadTokens: usage.cacheReadTokens,
        cacheCreationTokens: usage.cacheCreationTokens,
        query: `${userChatInput}`,
        maxToken: max_tokens,
        reasoningText,
        historyPreview: getHistoryPreview(chatCompleteMessages, 10000, aiChatVision),
        contextTotalLen: completeMessages.length,
        finishReason: finish_reason,
        llmRequestIds: [requestId], // 记录 LLM 请求追踪 ID
        firstTokenTime: firstTokenTimeSec
      },
      [DispatchNodeResponseKeyEnum.toolResponse]: answerText
    };
  } catch (error) {
    return getNodeErrResponse({ error });
  }
};
