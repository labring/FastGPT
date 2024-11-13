import type { NextApiResponse } from 'next';
import { filterGPTMessageByMaxTokens, loadRequestMessages } from '../../../chat/utils';
import type { ChatItemType, UserChatItemValueItemType } from '@fastgpt/global/core/chat/type.d';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import { createChatCompletion } from '../../../ai/config';
import type { ChatCompletion, StreamChatType } from '@fastgpt/global/core/ai/type.d';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import { postTextCensor } from '../../../../common/api/requestPlusApi';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import type { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { countMessagesTokens } from '../../../../common/string/tiktoken/index';
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
import { getLLMModel, ModelTypeEnum } from '../../../ai/model';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { getHistories } from '../utils';
import { filterSearchResultsByMaxChars } from '../../utils';
import { getHistoryPreview } from '@fastgpt/global/core/chat/utils';
import { addLog } from '../../../../common/system/log';
import { computedMaxToken, llmCompletionsBodyFormat } from '../../../ai/utils';
import { WorkflowResponseType } from '../type';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import { AiChatQuoteRoleType } from '@fastgpt/global/core/workflow/template/system/aiChat/type';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getFileContentFromLinks, getHistoryFileLinks } from '../tools/readFiles';
import { parseUrlToFileType } from '@fastgpt/global/common/file/tools';
import { i18nT } from '../../../../../web/i18n/utils';

export type ChatProps = ModuleDispatchProps<
  AIChatNodeProps & {
    [NodeInputKeyEnum.userChatInput]: string;
    [NodeInputKeyEnum.history]?: ChatItemType[] | number;
    [NodeInputKeyEnum.aiChatDatasetQuote]?: SearchDataResponseItemType[];
  }
>;
export type ChatResponse = DispatchNodeResultType<{
  [NodeOutputKeyEnum.answerText]: string;
  [NodeOutputKeyEnum.history]: ChatItemType[];
}>;

/* request openai chat */
export const dispatchChatCompletion = async (props: ChatProps): Promise<ChatResponse> => {
  let {
    res,
    requestOrigin,
    stream = false,
    user,
    histories,
    node: { name },
    query,
    runningAppInfo: { teamId },
    workflowStreamResponse,
    chatConfig,
    params: {
      model,
      temperature = 0,
      maxToken = 4000,
      history = 6,
      quoteQA,
      userChatInput,
      isResponseAnswerText = true,
      systemPrompt = '',
      aiChatQuoteRole = 'system',
      quoteTemplate,
      quotePrompt,
      aiChatVision,
      fileUrlList: fileLinks, // node quote file links
      stringQuoteText //abandon
    }
  } = props;
  const { files: inputFiles } = chatValue2RuntimePrompt(query); // Chat box input files

  stream = stream && isResponseAnswerText;

  const chatHistories = getHistories(history, histories);

  const modelConstantsData = getLLMModel(model);
  if (!modelConstantsData) {
    return Promise.reject('The chat model is undefined, you need to select a chat model.');
  }

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
      teamId
    })
  ]);

  if (!userChatInput && !documentQuoteText && userFiles.length === 0) {
    return Promise.reject(i18nT('chat:AI_input_is_empty'));
  }

  const [{ filterMessages }] = await Promise.all([
    getChatMessages({
      model: modelConstantsData,
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
    (() => {
      // censor model and system key
      if (modelConstantsData.censor && !user.openaiAccount?.key) {
        return postTextCensor({
          text: `${systemPrompt}
            ${userChatInput}
          `
        });
      }
    })()
  ]);

  const [requestMessages, max_tokens] = await Promise.all([
    loadRequestMessages({
      messages: filterMessages,
      useVision: modelConstantsData.vision && aiChatVision,
      origin: requestOrigin
    }),
    computedMaxToken({
      model: modelConstantsData,
      maxToken,
      filterMessages
    })
  ]);

  const requestBody = llmCompletionsBodyFormat(
    {
      model: modelConstantsData.model,
      temperature,
      max_tokens,
      stream,
      messages: requestMessages
    },
    modelConstantsData
  );
  // console.log(JSON.stringify(requestBody, null, 2), '===');
  try {
    const { response, isStreamResponse } = await createChatCompletion({
      body: requestBody,
      userKey: user.openaiAccount,
      options: {
        headers: {
          Accept: 'application/json, text/plain, */*'
        }
      }
    });

    const { answerText } = await (async () => {
      if (res && isStreamResponse) {
        // sse response
        const { answer } = await streamResponse({
          res,
          stream: response,
          workflowStreamResponse
        });

        if (!answer) {
          return Promise.reject(i18nT('chat:LLM_model_response_empty'));
        }

        return {
          answerText: answer
        };
      } else {
        const unStreamResponse = response as ChatCompletion;
        const answer = unStreamResponse.choices?.[0]?.message?.content || '';

        if (stream) {
          // Some models do not support streaming
          workflowStreamResponse?.({
            event: SseResponseEventEnum.fastAnswer,
            data: textAdaptGptResponse({
              text: answer
            })
          });
        }

        return {
          answerText: answer
        };
      }
    })();

    const completeMessages = requestMessages.concat({
      role: ChatCompletionRequestMessageRoleEnum.Assistant,
      content: answerText
    });
    const chatCompleteMessages = GPTMessages2Chats(completeMessages);

    const tokens = await countMessagesTokens(chatCompleteMessages);
    const { totalPoints, modelName } = formatModelChars2Points({
      model,
      tokens,
      modelType: ModelTypeEnum.llm
    });

    return {
      answerText,
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        totalPoints: user.openaiAccount?.key ? 0 : totalPoints,
        model: modelName,
        tokens,
        query: `${userChatInput}`,
        maxToken: max_tokens,
        historyPreview: getHistoryPreview(
          chatCompleteMessages,
          10000,
          modelConstantsData.vision && aiChatVision
        ),
        contextTotalLen: completeMessages.length
      },
      [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: [
        {
          moduleName: name,
          totalPoints: user.openaiAccount?.key ? 0 : totalPoints,
          model: modelName,
          tokens
        }
      ],
      [DispatchNodeResponseKeyEnum.toolResponses]: answerText,
      history: chatCompleteMessages
    };
  } catch (error) {
    addLog.warn(`LLM response error`, {
      baseUrl: user.openaiAccount?.baseUrl,
      requestBody
    });

    if (user.openaiAccount?.baseUrl) {
      return Promise.reject(`您的 OpenAI key 出错了: ${getErrText(error)}`);
    }

    return Promise.reject(error);
  }
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
      q: item.q,
      a: item.a,
      updateTime: formatTime2YMDHM(item.updateTime),
      source: item.sourceName,
      sourceId: String(item.sourceId || 'UnKnow'),
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
  teamId
}: {
  histories: ChatItemType[];
  inputFiles: UserChatItemValueItemType['file'][];
  fileLinks?: string[];
  stringQuoteText?: string; // file quote
  requestOrigin?: string;
  maxFiles: number;
  teamId: string;
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
    teamId
  });

  return {
    documentQuoteText: text,
    userFiles: fileLinks.map((url) => parseUrlToFileType(url))
  };
}

async function getChatMessages({
  model,
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

  const filterMessages = await filterGPTMessageByMaxTokens({
    messages: adaptMessages,
    maxTokens: model.maxContext - 300 // filter token. not response maxToken
  });

  return {
    filterMessages
  };
}

async function streamResponse({
  res,
  stream,
  workflowStreamResponse
}: {
  res: NextApiResponse;
  stream: StreamChatType;
  workflowStreamResponse?: WorkflowResponseType;
}) {
  const write = responseWriteController({
    res,
    readStream: stream
  });
  let answer = '';
  for await (const part of stream) {
    if (res.closed) {
      stream.controller?.abort();
      break;
    }
    const content = part.choices?.[0]?.delta?.content || '';
    answer += content;

    workflowStreamResponse?.({
      write,
      event: SseResponseEventEnum.answer,
      data: textAdaptGptResponse({
        text: content
      })
    });
  }

  return { answer };
}
