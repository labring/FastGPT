import type { NextApiResponse } from 'next';
import { filterGPTMessageByMaxContext, loadRequestMessages } from '../../../chat/utils';
import type { ChatItemType, UserChatItemValueItemType } from '@fastgpt/global/core/chat/type.d';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import { parseReasoningContent, parseReasoningStreamContent } from '../../../ai/utils';
import { createChatCompletion } from '../../../ai/config';
import type { ChatCompletionMessageParam, StreamChatType } from '@fastgpt/global/core/ai/type.d';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import { postTextCensor } from '../../../../common/api/requestPlusApi';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
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
  Prompt_DocumentQuote,
  Prompt_userQuotePromptList,
  Prompt_QuoteTemplateList,
  Prompt_systemQuotePromptList
} from '@fastgpt/global/core/ai/prompt/AIChat';
import type { AIChatNodeProps } from '@fastgpt/global/core/workflow/runtime/type.d';
import { replaceVariable } from '@fastgpt/global/common/string/tools';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { responseWriteController } from '../../../../common/response';
import { getLLMModel } from '../../../ai/model';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { checkQuoteQAValue, getHistories } from '../utils';
import { filterSearchResultsByMaxChars } from '../../utils';
import { getHistoryPreview } from '@fastgpt/global/core/chat/utils';
import { computedMaxToken, llmCompletionsBodyFormat } from '../../../ai/utils';
import { WorkflowResponseType } from '../type';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import { AiChatQuoteRoleType } from '@fastgpt/global/core/workflow/template/system/aiChat/type';
import { getFileContentFromLinks, getHistoryFileLinks } from '../tools/readFiles';
import { parseUrlToFileType } from '@fastgpt/global/common/file/tools';
import { i18nT } from '../../../../../web/i18n/utils';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';

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
    externalProvider,
    histories,
    node: { name },
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
    return Promise.reject('The chat model is undefined, you need to select a chat model.');
  }

  aiChatVision = modelConstantsData.vision && aiChatVision;
  aiChatReasoning = !!aiChatReasoning && !!modelConstantsData.reasoning;

  const chatHistories = getHistories(history, histories);
  quoteQA = checkQuoteQAValue(quoteQA);

  const [{ datasetQuoteText }, { documentQuoteText, userFiles }] = await Promise.all([
    filterDatasetQuote({
      quoteQA,
      model: modelConstantsData,
      quoteTemplate
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
      response_format: aiChatResponseFormat as any,
      json_schema: aiChatJsonSchema
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

  const { answerText, reasoningText } = await (async () => {
    if (isStreamResponse) {
      if (!res) {
        return {
          answerText: '',
          reasoningText: ''
        };
      }
      // sse response
      const { answer, reasoning } = await streamResponse({
        res,
        stream: response,
        aiChatReasoning,
        isResponseAnswerText,
        workflowStreamResponse
      });

      return {
        answerText: answer,
        reasoningText: reasoning
      };
    } else {
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

      // Some models do not support streaming
      if (stream) {
        if (aiChatReasoning && reasoningContent) {
          workflowStreamResponse?.({
            event: SseResponseEventEnum.fastAnswer,
            data: textAdaptGptResponse({
              reasoning_content: reasoningContent
            })
          });
        }
        if (isResponseAnswerText && content) {
          workflowStreamResponse?.({
            event: SseResponseEventEnum.fastAnswer,
            data: textAdaptGptResponse({
              text: content
            })
          });
        }
      }

      return {
        answerText: content,
        reasoningText: reasoningContent
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

  const inputTokens = await countGptMessagesTokens(requestMessages);
  const outputTokens = await countGptMessagesTokens(AIMessages);

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
      tokens: inputTokens + outputTokens,
      inputTokens: inputTokens,
      outputTokens: outputTokens,
      query: `${userChatInput}`,
      maxToken: max_tokens,
      reasoningText,
      historyPreview: getHistoryPreview(chatCompleteMessages, 10000, aiChatVision),
      contextTotalLen: completeMessages.length
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
  quoteTemplate?: string;
}) {
  function getValue(item: SearchDataResponseItemType, index: number) {
    return replaceVariable(quoteTemplate || Prompt_QuoteTemplateList[0].value, {
      id: item.id,
      q: item.q,
      a: item.a,
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
      ? `${filterQuoteQA.map((item, index) => getValue(item, index).trim()).join('\n------\n')}`
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

  const datasetQuotePromptTemplate = datasetQuotePrompt
    ? datasetQuotePrompt
    : quoteRole === 'user'
      ? Prompt_userQuotePromptList[0].value
      : Prompt_systemQuotePromptList[0].value;

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
      ? replaceVariable(Prompt_DocumentQuote, {
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
  isResponseAnswerText
}: {
  res: NextApiResponse;
  stream: StreamChatType;
  workflowStreamResponse?: WorkflowResponseType;
  aiChatReasoning?: boolean;
  isResponseAnswerText?: boolean;
}) {
  const write = responseWriteController({
    res,
    readStream: stream
  });
  let answer = '';
  let reasoning = '';
  const { parsePart, getStartTagBuffer } = parseReasoningStreamContent();

  for await (const part of stream) {
    if (res.closed) {
      stream.controller?.abort();
      break;
    }

    const [reasoningContent, content] = parsePart(part, aiChatReasoning);
    answer += content;
    reasoning += reasoningContent;

    if (aiChatReasoning && reasoningContent) {
      workflowStreamResponse?.({
        write,
        event: SseResponseEventEnum.answer,
        data: textAdaptGptResponse({
          reasoning_content: reasoningContent
        })
      });
    }

    if (isResponseAnswerText && content) {
      workflowStreamResponse?.({
        write,
        event: SseResponseEventEnum.answer,
        data: textAdaptGptResponse({
          text: content
        })
      });
    }
  }

  // if answer is empty, try to get value from startTagBuffer. (Cause: The response content is too short to exceed the minimum parse length)
  if (answer === '') {
    answer = getStartTagBuffer();
    if (isResponseAnswerText && answer) {
      workflowStreamResponse?.({
        write,
        event: SseResponseEventEnum.answer,
        data: textAdaptGptResponse({
          text: answer
        })
      });
    }
  }

  return { answer, reasoning };
}
