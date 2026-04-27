import { filterGPTMessageByMaxContext } from '../../../ai/llm/utils';
import type { ChatItemMiniType, UserChatItemFileItemType } from '@fastgpt/global/core/chat/type';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';
import type {
  ChatDispatchProps,
  DispatchNodeResultType
} from '@fastgpt/global/core/workflow/runtime/type';
import {
  chats2GPTMessages,
  chatValue2RuntimePrompt,
  getSystemPrompt_ChatItemType,
  GPTMessages2Chats,
  runtimePrompt2ChatsValue
} from '@fastgpt/global/core/chat/adapt';
import { getQuoteTemplate, getQuotePrompt } from '@fastgpt/global/core/ai/prompt/AIChat';
import type { AIChatNodeProps } from '@fastgpt/global/core/workflow/runtime/type';
import { replaceVariable } from '@fastgpt/global/common/string/tools';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { getLLMModel } from '../../../ai/model';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import type { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { checkQuoteQAValue, getNodeErrResponse, getHistories } from '../utils';
import { filterSearchResultsByMaxChars } from '../../utils';
import { getHistoryPreview } from '@fastgpt/global/core/chat/utils';
import { computedMaxToken } from '../../../ai/utils';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import type { AiChatQuoteRoleType } from '@fastgpt/global/core/workflow/template/system/aiChat/type';
import { getFileContentFromLinks } from '../../utils/file';
import { parseUrlToFileType } from '../../utils/context';
import { rewriteUserQueryWithFiles } from '../../utils/file';
import { i18nT } from '../../../../../web/i18n/utils';
import { postTextCensor } from '../../../chat/postTextCensor';
import { createLLMResponse } from '../../../ai/llm/request';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';

export type ChatProps = ModuleDispatchProps<
  AIChatNodeProps & {
    [NodeInputKeyEnum.userChatInput]?: string;
    [NodeInputKeyEnum.history]?: ChatItemMiniType[] | number;
    [NodeInputKeyEnum.aiChatDatasetQuote]?: SearchDataResponseItemType[];
  }
>;
export type ChatResponse = DispatchNodeResultType<
  {
    [NodeOutputKeyEnum.answerText]: string;
    [NodeOutputKeyEnum.reasoningText]?: string;
    [NodeOutputKeyEnum.history]: ChatItemMiniType[];
  },
  {
    [NodeOutputKeyEnum.errorText]: string;
  }
>;

/* request openai chat */
export const dispatchChatCompletion = async (props: ChatProps): Promise<ChatResponse> => {
  let {
    res,
    checkIsStopping,
    requestOrigin,
    stream = false,
    retainDatasetCite = true,
    externalProvider,
    histories,
    node: { name, version, inputs },
    query,
    runningUserInfo,
    workflowStreamResponse,
    chatConfig,
    usageId,
    params: {
      model,
      temperature,
      maxToken,
      history = 6,
      quoteQA,
      userChatInput = '',
      isResponseAnswerText = true,
      systemPrompt = '',
      aiChatQuoteRole = 'system',
      quoteTemplate,
      quotePrompt,
      aiChatVision,
      aiChatReasoning = true,
      aiChatTopP,
      aiChatStopSign,
      aiChatResponseFormat,
      aiChatJsonSchema,

      fileUrlList: fileLinks // node quote file links
    }
  } = props;

  const modelConstantsData = getLLMModel(model);
  if (!modelConstantsData) {
    return getNodeErrResponse({
      error: `Model ${model} is undefined, you need to select a chat model.`
    });
  }

  try {
    aiChatVision = modelConstantsData.vision && aiChatVision;
    // Check fileLinks is reference variable
    const fileUrlInput = inputs.find((item) => item.key === NodeInputKeyEnum.fileUrlList);
    if (!fileUrlInput || !fileUrlInput.value || fileUrlInput.value.length === 0) {
      fileLinks = undefined;
    }

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
    // 赋值给 userChatInput
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
        requestOrigin,
        maxFiles: chatConfig?.fileSelectConfig?.maxFiles || 20,
        customPdfParse: chatConfig?.fileSelectConfig?.customPdfParse,
        usageId,
        runningUserInfo
      }),
      // Censor = true and system key, will check content
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

    console.log(111111);
    console.dir(filterMessages, { depth: null });

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
        response_format: {
          type: aiChatResponseFormat,
          json_schema: aiChatJsonSchema
        },
        retainDatasetCite,
        useVision: aiChatVision,
        requestOrigin
      },
      userKey: externalProvider.openaiAccount,
      isAborted: checkIsStopping,
      onReasoning({ text }) {
        if (!aiChatReasoning) return;
        workflowStreamResponse?.({
          event: SseResponseEventEnum.answer,
          data: textAdaptGptResponse({
            reasoning_content: text
          })
        });
      },
      onStreaming({ text }) {
        if (!isResponseAnswerText) return;
        workflowStreamResponse?.({
          event: SseResponseEventEnum.answer,
          data: textAdaptGptResponse({
            text
          })
        });
      }
    });

    if (responseEmptyTip) {
      return getNodeErrResponse({ error: responseEmptyTip });
    }

    // Usage push
    const { totalPoints, modelName } = formatModelChars2Points({
      model: modelConstantsData.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens
    });
    const points = externalProvider.openaiAccount?.key ? 0 : totalPoints;
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
      [DispatchNodeResponseKeyEnum.toolResponses]: answerText
    };
  } catch (error) {
    return getNodeErrResponse({ error });
  }
};

const getDatasetCiteData = async ({
  quoteQA = [],
  model,
  quoteTemplate,
  aiChatQuoteRole,
  datasetQuotePrompt = '',
  userChatInput,
  version,
  useDatasetQuote
}: {
  quoteQA: ChatProps['params']['quoteQA'];
  model: LLMModelItemType;
  quoteTemplate: string;

  userChatInput: string;
  aiChatQuoteRole: AiChatQuoteRoleType;
  datasetQuotePrompt?: string;
  version?: string;
  useDatasetQuote: boolean;
}) => {
  function getValue({ item, index }: { item: SearchDataResponseItemType; index: number }) {
    return replaceVariable(quoteTemplate, {
      id: item.id,
      q: item.q,
      a: item.a || '',
      updateTime: formatTime2YMDHM(item.updateTime),
      source: item.sourceName,
      sourceId: String(item.sourceId || ''),
      index: index + 1
    });
  }

  // slice filterSearch
  const filterQuoteQA = await filterSearchResultsByMaxChars(quoteQA, model.quoteMaxToken);

  const datasetQuoteText =
    filterQuoteQA.length > 0
      ? `${filterQuoteQA.map((item, index) => getValue({ item, index }).trim()).join('\n------\n')}`
      : '';

  // User role or prompt include question
  const quoteRole =
    aiChatQuoteRole === 'user' || datasetQuotePrompt.includes('{{question}}') ? 'user' : 'system';

  const defaultQuotePrompt = getQuotePrompt(version, quoteRole);

  const datasetQuotePromptTemplate = datasetQuotePrompt || defaultQuotePrompt;

  // Reset user input, add dataset quote to user input
  const replaceInputValue =
    useDatasetQuote && quoteRole === 'user'
      ? replaceVariable(datasetQuotePromptTemplate, {
          quote: datasetQuoteText,
          question: userChatInput
        })
      : userChatInput;

  const systemPrompt =
    useDatasetQuote && quoteRole === 'system'
      ? replaceVariable(datasetQuotePromptTemplate, {
          quote: datasetQuoteText
        })
      : '';

  return {
    userInput: replaceInputValue,
    systemPrompt
  };
};

const getInputFiles = ({ fileLinks = [] }: { fileLinks?: string[] }) => {
  return fileLinks
    .map((url) => parseUrlToFileType(url))
    .filter(Boolean) as UserChatItemFileItemType[];
};

const getChatMessages = async ({
  model,
  maxTokens = 0,
  histories = [],
  datasetCiteSystemPrompt,
  systemPrompt,
  userChatInput,
  userFiles,
  requestOrigin,
  maxFiles,
  customPdfParse,
  usageId,
  runningUserInfo
}: {
  model: LLMModelItemType;
  maxTokens?: number;
  histories: ChatItemMiniType[];

  datasetCiteSystemPrompt?: string;
  systemPrompt: string;

  userChatInput: string;
  userFiles: UserChatItemFileItemType[];

  requestOrigin?: string;
  maxFiles: number;
  customPdfParse?: boolean;
  usageId?: string;
  runningUserInfo: ChatDispatchProps['runningUserInfo'];
}) => {
  const concatenateSystemPrompt = [
    model.defaultSystemChatPrompt,
    systemPrompt,
    datasetCiteSystemPrompt
  ]
    .filter(Boolean)
    .join('\n\n===---===---===\n\n');

  const rawUserMessages: ChatItemMiniType[] = [
    ...getSystemPrompt_ChatItemType(concatenateSystemPrompt),
    ...histories,
    {
      obj: ChatRoleEnum.Human,
      value: runtimePrompt2ChatsValue({
        files: userFiles,
        text: userChatInput
      })
    }
  ];

  const messages = await Promise.all(
    rawUserMessages.map(async (message, index): Promise<ChatItemMiniType> => {
      if (message.obj !== ChatRoleEnum.Human) {
        return message;
      }

      return {
        ...message,
        value: await rewriteUserQueryWithFiles({
          queryId: message.dataId || `${index}`,
          userQuery: message.value,
          requestOrigin,
          maxFiles,
          customPdfParse,
          usageId,
          teamId: runningUserInfo.teamId,
          tmbId: runningUserInfo.tmbId
        })
      };
    })
  );

  const adaptMessages = chats2GPTMessages({
    messages,
    reserveId: false
  });

  return await filterGPTMessageByMaxContext({
    messages: adaptMessages,
    maxContext: model.maxContext - maxTokens // filter token. not response maxToken
  });
};
