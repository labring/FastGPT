import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { getQuoteTemplate } from '@fastgpt/global/core/ai/prompt/AIChat';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import { getHistoryPreview } from '@fastgpt/global/core/chat/utils';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { workflowSseEvent } from '@fastgpt/global/core/workflow/runtime/sse';

import { formatModelChars2Points } from '../../../../../support/wallet/usage/utils';
import { createLLMResponse } from '../../../../ai/llm/request';
import { computedMaxToken } from '../../../../ai/utils';
import { getWorkflowFileContext, getWorkflowFileMaxAmount } from '../../../utils/context';
import { loadWorkflowModelResource } from '../../../resource/service';
import { checkQuoteQAValue, getHistories, getNodeErrResponse } from '../../utils';
import { getChatMessages } from './chatMessages';
import { getDatasetCiteData } from './datasetCite';
import { getAIChatFileContextConfig, getInputFiles } from './fileContext';
import type { ChatProps, ChatResponse } from './type';
import { checkModelPromptAndInput } from '../../../../plugin/moderation/modelInput';
import { MODERATION_BLOCKED_ERROR_MESSAGE } from '@fastgpt/global/core/plugin/moderation/constants';

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
    runningAppInfo,
    runningUserInfo,
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
      systemPrompt: rawSystemPrompt = '',
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
  let systemPrompt = rawSystemPrompt;
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

    // 锚点 2：进入模型前审查用户输入与系统提示词
    const moderationContext = {
      teamId: runningUserInfo?.teamId,
      tmbId: runningUserInfo?.tmbId,
      appId: runningAppInfo?.sourceId,
      chatId: props.chatId,
      responseChatItemId: props.responseChatItemId,
      nodeId: props.node.nodeId,
      nodeName: props.node.name
    };

    const checked = await checkModelPromptAndInput({
      userChatInput,
      systemPrompt,
      context: moderationContext
    });

    // 必需输入有效性校验：若用户问题被拦截导致节点无有效输入，该节点本次不运行并报错终止
    if (checked.isUserChatInputBlocked) {
      return getNodeErrResponse({
        error: checked.blockErrorMessage || MODERATION_BLOCKED_ERROR_MESSAGE
      });
    }

    userChatInput = checked.userChatInput;
    systemPrompt = checked.systemPrompt;

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
    // 审查知识库引用切片（若引用被拼入 systemPrompt 或拼入 userInput，均需送审）
    if (datasetCiteData.systemPrompt) {
      const citeChecked = await checkModelPromptAndInput({
        datasetCitePrompt: datasetCiteData.systemPrompt,
        context: moderationContext
      });
      datasetCiteData.systemPrompt = citeChecked.datasetCitePrompt ?? '';
    }

    if (datasetCiteData.userInput && datasetCiteData.userInput !== userChatInput) {
      const userCiteChecked = await checkModelPromptAndInput({
        userChatInput: datasetCiteData.userInput,
        context: moderationContext
      });
      if (userCiteChecked.isUserChatInputBlocked) {
        return getNodeErrResponse({
          error: userCiteChecked.blockErrorMessage || MODERATION_BLOCKED_ERROR_MESSAGE
        });
      }
      datasetCiteData.userInput = userCiteChecked.userChatInput ?? '';
    }

    userChatInput = datasetCiteData.userInput;

    if (!userChatInput && userFiles.length === 0) {
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
      maxFileAmount: getWorkflowFileMaxAmount(),
      customPdfParse: chatConfig?.fileSelectConfig?.customPdfParse,
      usageId,
      runningUserInfo
    });

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
          outputTokens: usage.outputTokens
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
      outputTokens: usage.outputTokens
    });
    const points = usage.usedUserOpenAIKey ? 0 : totalPoints;
    props.usagePush([
      {
        moduleName: name,
        totalPoints: points,
        modelId: modelConstantsData.modelId,
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
          model: modelConstantsData.name,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
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
