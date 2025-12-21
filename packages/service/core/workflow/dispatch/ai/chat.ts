import { filterGPTMessageByMaxContext } from '../../../ai/llm/utils';
import type { ChatItemType, UserChatItemValueItemType } from '@fastgpt/global/core/chat/type.d';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
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
import {
  getQuoteTemplate,
  getQuotePrompt,
  getDocumentQuotePrompt
} from '@fastgpt/global/core/ai/prompt/AIChat';
import type { AIChatNodeProps } from '@fastgpt/global/core/workflow/runtime/type.d';
import { replaceVariable } from '@fastgpt/global/common/string/tools';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { responseWriteController } from '../../../../common/response';
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
import { getFileContentFromLinks, getHistoryFileLinks } from '../tools/readFiles';
import { parseUrlToFileType } from '@fastgpt/global/common/file/tools';
import { i18nT } from '../../../../../web/i18n/utils';
import { postTextCensor } from '../../../chat/postTextCensor';
import { createLLMResponse } from '../../../ai/llm/request';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';

export type ChatProps = ModuleDispatchProps<
  AIChatNodeProps & {
    [NodeInputKeyEnum.userChatInput]?: string;
    [NodeInputKeyEnum.history]?: ChatItemType[] | number;
    [NodeInputKeyEnum.aiChatDatasetQuote]?: SearchDataResponseItemType[];
  }
>;
export type ChatResponse = DispatchNodeResultType<
  {
    [NodeOutputKeyEnum.answerText]: string;
    [NodeOutputKeyEnum.reasoningText]?: string;
    [NodeOutputKeyEnum.history]: ChatItemType[];
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

      fileUrlList: fileLinks, // node quote file links
      stringQuoteText //abandon
    }
  } = props;

  const { files: inputFiles } = chatValue2RuntimePrompt(query); // Chat box input files

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

    const [{ datasetQuoteText }, { documentQuoteText, userFiles }] = await Promise.all([
      filterDatasetQuote({
        quoteQA,
        model: modelConstantsData,
        quoteTemplate: quoteTemplate || getQuoteTemplate(version)
      }),
      getMultiInput({
        histories: chatHistories,
        inputFiles,
        fileLinks,
        stringQuoteText,
        requestOrigin,
        maxFiles: chatConfig?.fileSelectConfig?.maxFiles || 20,
        customPdfParse: chatConfig?.fileSelectConfig?.customPdfParse,
        usageId,
        runningUserInfo
      })
    ]);

    if (!userChatInput && !documentQuoteText && userFiles.length === 0) {
      return getNodeErrResponse({ error: i18nT('chat:AI_input_is_empty') });
    }

    const max_tokens = computedMaxToken({
      model: modelConstantsData,
      maxToken
    });

    const [{ filterMessages }] = await Promise.all([
      getChatMessages({
        model: modelConstantsData,
        maxTokens: max_tokens,
        histories: chatHistories,
        useDatasetQuote: quoteQA !== undefined,
        datasetQuoteText,
        aiChatQuoteRole,
        datasetQuotePrompt: quotePrompt,
        version,
        userChatInput,
        systemPrompt,
        userFiles,
        documentQuoteText
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

    const write = res ? responseWriteController({ res, readStream: stream }) : undefined;

    const {
      completeMessages,
      reasoningText,
      answerText,
      finish_reason,
      getEmptyResponseTip,
      usage
    } = await createLLMResponse({
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
          write,
          event: SseResponseEventEnum.answer,
          data: textAdaptGptResponse({
            reasoning_content: text
          })
        });
      },
      onStreaming({ text }) {
        if (!isResponseAnswerText) return;
        workflowStreamResponse?.({
          write,
          event: SseResponseEventEnum.answer,
          data: textAdaptGptResponse({
            text
          })
        });
      }
    });

    if (!answerText && !reasoningText) {
      return getNodeErrResponse({ error: getEmptyResponseTip() });
    }

    const { totalPoints, modelName } = formatModelChars2Points({
      model: modelConstantsData.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens
    });
    const points = externalProvider.openaiAccount?.key ? 0 : totalPoints;

    const chatCompleteMessages = GPTMessages2Chats({ messages: completeMessages });

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
        finishReason: finish_reason
      },
      [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: [
        {
          moduleName: name,
          totalPoints: points,
          model: modelName,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens
        }
      ],
      [DispatchNodeResponseKeyEnum.toolResponses]: answerText
    };
  } catch (error) {
    return getNodeErrResponse({ error });
  }
};

async function filterDatasetQuote({
  quoteQA = [],
  model,
  quoteTemplate
}: {
  quoteQA: ChatProps['params']['quoteQA'];
  model: LLMModelItemType;
  quoteTemplate: string;
}) {
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

  return {
    datasetQuoteText
  };
}

async function getMultiInput({
  histories,
  inputFiles,
  fileLinks,
  stringQuoteText,
  requestOrigin,
  maxFiles,
  customPdfParse,
  usageId,
  runningUserInfo
}: {
  histories: ChatItemType[];
  inputFiles: UserChatItemValueItemType['file'][];
  fileLinks?: string[];
  stringQuoteText?: string; // file quote
  requestOrigin?: string;
  maxFiles: number;
  customPdfParse?: boolean;
  usageId?: string;
  runningUserInfo: ChatDispatchProps['runningUserInfo'];
}) {
  // 旧版本适配====>
  if (stringQuoteText) {
    return {
      documentQuoteText: stringQuoteText,
      userFiles: inputFiles
    };
  }

  // 没有引用文件参考，但是可能用了图片识别
  if (!fileLinks) {
    return {
      documentQuoteText: '',
      userFiles: inputFiles
    };
  }
  // 旧版本适配<====

  // If fileLinks params is not empty, it means it is a new version, not get the global file.

  // Get files from histories
  const filesFromHistories = getHistoryFileLinks(histories);
  const urls = [...fileLinks, ...filesFromHistories];

  if (urls.length === 0) {
    return {
      documentQuoteText: '',
      userFiles: []
    };
  }

  const { text } = await getFileContentFromLinks({
    // Concat fileUrlList and filesFromHistories; remove not supported files
    urls,
    requestOrigin,
    maxFiles,
    teamId: runningUserInfo.teamId,
    tmbId: runningUserInfo.tmbId,
    customPdfParse,
    usageId
  });

  return {
    documentQuoteText: text,
    userFiles: fileLinks.map((url) => parseUrlToFileType(url)).filter(Boolean)
  };
}

async function getChatMessages({
  model,
  maxTokens = 0,
  aiChatQuoteRole,
  datasetQuotePrompt = '',
  datasetQuoteText,
  useDatasetQuote,
  version,
  histories = [],
  systemPrompt,
  userChatInput,
  userFiles,
  documentQuoteText
}: {
  model: LLMModelItemType;
  maxTokens?: number;
  // dataset quote
  aiChatQuoteRole: AiChatQuoteRoleType; // user: replace user prompt; system: replace system prompt
  datasetQuotePrompt?: string;
  datasetQuoteText: string;
  version?: string;

  useDatasetQuote: boolean;
  histories: ChatItemType[];
  systemPrompt: string;
  userChatInput: string;

  userFiles: UserChatItemValueItemType['file'][];
  documentQuoteText?: string; // document quote
}) {
  // Dataset prompt ====>
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
  // Dataset prompt <====

  // Concat system prompt
  const concatenateSystemPrompt = [
    model.defaultSystemChatPrompt,
    systemPrompt,
    useDatasetQuote && quoteRole === 'system'
      ? replaceVariable(datasetQuotePromptTemplate, {
          quote: datasetQuoteText
        })
      : '',
    documentQuoteText
      ? replaceVariable(getDocumentQuotePrompt(version), {
          quote: documentQuoteText
        })
      : ''
  ]
    .filter(Boolean)
    .join('\n\n===---===---===\n\n');

  const messages: ChatItemType[] = [
    ...getSystemPrompt_ChatItemType(concatenateSystemPrompt),
    ...histories,
    {
      obj: ChatRoleEnum.Human,
      value: runtimePrompt2ChatsValue({
        files: userFiles,
        text: replaceInputValue
      })
    }
  ];

  const adaptMessages = chats2GPTMessages({ messages, reserveId: false });

  const filterMessages = await filterGPTMessageByMaxContext({
    messages: adaptMessages,
    maxContext: model.maxContext - maxTokens // filter token. not response maxToken
  });

  return {
    filterMessages
  };
}
