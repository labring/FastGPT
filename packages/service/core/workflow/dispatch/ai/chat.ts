import type { NextApiResponse } from 'next';
import { filterGPTMessageByMaxContext, loadRequestMessages } from '../../../chat/utils';
import type { ChatItemType, UserChatItemValueItemType } from '@fastgpt/global/core/chat/type.d';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import {
  removeDatasetCiteText,
  parseReasoningContent,
  parseLLMStreamResponse
} from '../../../ai/utils';
import { createChatCompletion } from '../../../ai/config';
import type {
  ChatCompletionMessageParam,
  CompletionFinishReason,
  StreamChatType
} from '@fastgpt/global/core/ai/type.d';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import {
  ChatCompletionRequestMessageRoleEnum,
  getLLMDefaultUsage
} from '@fastgpt/global/core/ai/constants';
import type {
  ChatDispatchProps,
  DispatchNodeResultType
} from '@fastgpt/global/core/workflow/runtime/type';
import { countGptMessagesTokens } from '../../../../common/string/tiktoken/index';
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
import { checkQuoteQAValue, getHistories } from '../utils';
import { filterSearchResultsByMaxChars } from '../../utils';
import { getHistoryPreview } from '@fastgpt/global/core/chat/utils';
import { computedMaxToken, llmCompletionsBodyFormat } from '../../../ai/utils';
import { type WorkflowResponseType } from '../type';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import { type AiChatQuoteRoleType } from '@fastgpt/global/core/workflow/template/system/aiChat/type';
import { getFileContentFromLinks, getHistoryFileLinks } from '../tools/readFiles';
import { parseUrlToFileType } from '@fastgpt/global/common/file/tools';
import { i18nT } from '../../../../../web/i18n/utils';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import { postTextCensor } from '../../../chat/postTextCensor';

export type ChatProps = ModuleDispatchProps<
  AIChatNodeProps & {
    [NodeInputKeyEnum.userChatInput]?: string;
    [NodeInputKeyEnum.history]?: ChatItemType[] | number;
    [NodeInputKeyEnum.aiChatDatasetQuote]?: SearchDataResponseItemType[];
  }
>;
export type ChatResponse = DispatchNodeResultType<{
  [NodeOutputKeyEnum.answerText]: string;
  [NodeOutputKeyEnum.reasoningText]?: string;
  [NodeOutputKeyEnum.history]: ChatItemType[];
}>;

/* request openai chat */
export const dispatchChatCompletion = async (props: ChatProps): Promise<ChatResponse> => {
  let {
    res,
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
    return Promise.reject(`Mode ${model} is undefined, you need to select a chat model.`);
  }

  aiChatVision = modelConstantsData.vision && aiChatVision;
  aiChatReasoning = !!aiChatReasoning && !!modelConstantsData.reasoning;
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
      runningUserInfo
    })
  ]);

  if (!userChatInput && !documentQuoteText && userFiles.length === 0) {
    return Promise.reject(i18nT('chat:AI_input_is_empty'));
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

  const requestMessages = await loadRequestMessages({
    messages: filterMessages,
    useVision: aiChatVision,
    origin: requestOrigin
  });

  const requestBody = llmCompletionsBodyFormat(
    {
      model: modelConstantsData.model,
      stream,
      messages: requestMessages,
      temperature,
      max_tokens,
      top_p: aiChatTopP,
      stop: aiChatStopSign,
      response_format: {
        type: aiChatResponseFormat as any,
        json_schema: aiChatJsonSchema
      }
    },
    modelConstantsData
  );
  // console.log(JSON.stringify(requestBody, null, 2), '===');
  const { response, isStreamResponse, getEmptyResponseTip } = await createChatCompletion({
    body: requestBody,
    userKey: externalProvider.openaiAccount,
    options: {
      headers: {
        Accept: 'application/json, text/plain, */*'
      }
    }
  });

  let { answerText, reasoningText, finish_reason, inputTokens, outputTokens } = await (async () => {
    if (isStreamResponse) {
      if (!res || res.closed) {
        return {
          answerText: '',
          reasoningText: '',
          finish_reason: 'close' as const,
          inputTokens: 0,
          outputTokens: 0
        };
      }
      // sse response
      const { answer, reasoning, finish_reason, usage } = await streamResponse({
        res,
        stream: response,
        aiChatReasoning,
        parseThinkTag: modelConstantsData.reasoning,
        isResponseAnswerText,
        workflowStreamResponse,
        retainDatasetCite
      });

      return {
        answerText: answer,
        reasoningText: reasoning,
        finish_reason,
        inputTokens: usage?.prompt_tokens,
        outputTokens: usage?.completion_tokens
      };
    } else {
      const finish_reason = response.choices?.[0]?.finish_reason as CompletionFinishReason;
      const usage = response.usage;

      const { content, reasoningContent } = (() => {
        const content = response.choices?.[0]?.message?.content || '';
        // @ts-ignore
        const reasoningContent: string = response.choices?.[0]?.message?.reasoning_content || '';

        // API already parse reasoning content
        if (reasoningContent || !aiChatReasoning) {
          return {
            content,
            reasoningContent
          };
        }

        const [think, answer] = parseReasoningContent(content);
        return {
          content: answer,
          reasoningContent: think
        };
      })();

      const formatReasonContent = removeDatasetCiteText(reasoningContent, retainDatasetCite);
      const formatContent = removeDatasetCiteText(content, retainDatasetCite);

      // Some models do not support streaming
      if (aiChatReasoning && reasoningContent) {
        workflowStreamResponse?.({
          event: SseResponseEventEnum.fastAnswer,
          data: textAdaptGptResponse({
            reasoning_content: formatReasonContent
          })
        });
      }
      if (isResponseAnswerText && content) {
        workflowStreamResponse?.({
          event: SseResponseEventEnum.fastAnswer,
          data: textAdaptGptResponse({
            text: formatContent
          })
        });
      }

      return {
        reasoningText: formatReasonContent,
        answerText: formatContent,
        finish_reason,
        inputTokens: usage?.prompt_tokens,
        outputTokens: usage?.completion_tokens
      };
    }
  })();

  if (!answerText && !reasoningText) {
    return Promise.reject(getEmptyResponseTip());
  }

  const AIMessages: ChatCompletionMessageParam[] = [
    {
      role: ChatCompletionRequestMessageRoleEnum.Assistant,
      content: answerText,
      reasoning_text: reasoningText // reasoning_text is only recorded for response, but not for request
    }
  ];

  const completeMessages = [...requestMessages, ...AIMessages];
  const chatCompleteMessages = GPTMessages2Chats(completeMessages);

  inputTokens = inputTokens || (await countGptMessagesTokens(requestMessages));
  outputTokens = outputTokens || (await countGptMessagesTokens(AIMessages));

  const { totalPoints, modelName } = formatModelChars2Points({
    model,
    inputTokens,
    outputTokens,
    modelType: ModelTypeEnum.llm
  });

  return {
    answerText: answerText.trim(),
    reasoningText,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      totalPoints: externalProvider.openaiAccount?.key ? 0 : totalPoints,
      model: modelName,
      inputTokens: inputTokens,
      outputTokens: outputTokens,
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
        totalPoints: externalProvider.openaiAccount?.key ? 0 : totalPoints,
        model: modelName,
        inputTokens: inputTokens,
        outputTokens: outputTokens
      }
    ],
    [DispatchNodeResponseKeyEnum.toolResponses]: answerText,
    history: chatCompleteMessages
  };
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
  runningUserInfo
}: {
  histories: ChatItemType[];
  inputFiles: UserChatItemValueItemType['file'][];
  fileLinks?: string[];
  stringQuoteText?: string; // file quote
  requestOrigin?: string;
  maxFiles: number;
  customPdfParse?: boolean;
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
    customPdfParse,
    teamId: runningUserInfo.teamId,
    tmbId: runningUserInfo.tmbId
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

async function streamResponse({
  res,
  stream,
  workflowStreamResponse,
  aiChatReasoning,
  parseThinkTag,
  isResponseAnswerText,
  retainDatasetCite = true
}: {
  res: NextApiResponse;
  stream: StreamChatType;
  workflowStreamResponse?: WorkflowResponseType;
  aiChatReasoning?: boolean;
  parseThinkTag?: boolean;
  isResponseAnswerText?: boolean;
  retainDatasetCite: boolean;
}) {
  const write = responseWriteController({
    res,
    readStream: stream
  });

  const { parsePart, getResponseData, updateFinishReason } = parseLLMStreamResponse();

  for await (const part of stream) {
    if (res.closed) {
      stream.controller?.abort();
      updateFinishReason('close');
      break;
    }

    const { reasoningContent, responseContent } = parsePart({
      part,
      parseThinkTag,
      retainDatasetCite
    });

    if (aiChatReasoning && reasoningContent) {
      workflowStreamResponse?.({
        write,
        event: SseResponseEventEnum.answer,
        data: textAdaptGptResponse({
          reasoning_content: reasoningContent
        })
      });
    }

    if (isResponseAnswerText && responseContent) {
      workflowStreamResponse?.({
        write,
        event: SseResponseEventEnum.answer,
        data: textAdaptGptResponse({
          text: responseContent
        })
      });
    }
  }

  const { reasoningContent: reasoning, content: answer, finish_reason, usage } = getResponseData();

  return { answer, reasoning, finish_reason, usage };
}
