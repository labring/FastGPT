import type { NextApiResponse } from 'next';
import { filterGPTMessageByMaxTokens, loadRequestMessages } from '../../../chat/utils';
import type { ChatItemType, UserChatItemValueItemType } from '@fastgpt/global/core/chat/type.d';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import { getAIApi } from '../../../ai/config';
import type {
  ChatCompletion,
  ChatCompletionMessageParam,
  StreamChatType
} from '@fastgpt/global/core/ai/type.d';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import { postTextCensor } from '../../../../common/api/requestPlusApi';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import type { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { countMessagesTokens } from '../../../../common/string/tiktoken/index';
import {
  chats2GPTMessages,
  chatValue2RuntimePrompt,
  getSystemPrompt,
  GPTMessages2Chats,
  runtimePrompt2ChatsValue
} from '@fastgpt/global/core/chat/adapt';
import {
  Prompt_DocumentQuote,
  Prompt_QuotePromptList,
  Prompt_QuoteTemplateList
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
import { computedMaxToken, computedTemperature } from '../../../ai/utils';
import { WorkflowResponseType } from '../type';

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
    workflowStreamResponse,
    params: {
      model,
      temperature = 0,
      maxToken = 4000,
      history = 6,
      quoteQA,
      userChatInput,
      isResponseAnswerText = true,
      systemPrompt = '',
      quoteTemplate,
      quotePrompt,
      aiChatVision,
      stringQuoteText
    }
  } = props;
  const { files: inputFiles } = chatValue2RuntimePrompt(query);

  if (!userChatInput && inputFiles.length === 0) {
    return Promise.reject('Question is empty');
  }
  stream = stream && isResponseAnswerText;

  const chatHistories = getHistories(history, histories);

  const modelConstantsData = getLLMModel(model);
  if (!modelConstantsData) {
    return Promise.reject('The chat model is undefined, you need to select a chat model.');
  }

  const { datasetQuoteText } = await filterDatasetQuote({
    quoteQA,
    model: modelConstantsData,
    quoteTemplate
  });

  const [{ filterMessages }] = await Promise.all([
    getChatMessages({
      model: modelConstantsData,
      histories: chatHistories,
      useDatasetQuote: quoteQA !== undefined,
      datasetQuoteText,
      datasetQuotePrompt: quotePrompt,
      userChatInput,
      inputFiles,
      systemPrompt,
      stringQuoteText
    }),
    (() => {
      // censor model and system key
      if (modelConstantsData.censor && !user.openaiAccount?.key) {
        return postTextCensor({
          text: `${systemPrompt}
            ${datasetQuoteText}
            ${userChatInput}
          `
        });
      }
    })()
  ]);

  // Get the request messages
  const concatMessages = [
    ...(modelConstantsData.defaultSystemChatPrompt
      ? [
          {
            role: ChatCompletionRequestMessageRoleEnum.System,
            content: modelConstantsData.defaultSystemChatPrompt
          }
        ]
      : []),
    ...filterMessages
  ] as ChatCompletionMessageParam[];

  const [requestMessages, max_tokens] = await Promise.all([
    loadRequestMessages({
      messages: concatMessages,
      useVision: modelConstantsData.vision && aiChatVision,
      origin: requestOrigin
    }),
    computedMaxToken({
      model: modelConstantsData,
      maxToken,
      filterMessages
    })
  ]);

  const requestBody = {
    ...modelConstantsData?.defaultConfig,
    model: modelConstantsData.model,
    temperature: computedTemperature({
      model: modelConstantsData,
      temperature
    }),
    max_tokens,
    stream,
    messages: requestMessages
  };
  // console.log(JSON.stringify(requestBody, null, 2), '===');
  try {
    const ai = getAIApi({
      userKey: user.openaiAccount,
      timeout: 480000
    });
    const response = await ai.chat.completions.create(requestBody, {
      headers: {
        Accept: 'application/json, text/plain, */*'
      }
    });

    const { answerText } = await (async () => {
      if (res && stream) {
        // sse response
        const { answer } = await streamResponse({
          res,
          stream: response,
          workflowStreamResponse
        });

        if (!answer) {
          throw new Error('LLM model response empty');
        }

        return {
          answerText: answer
        };
      } else {
        const unStreamResponse = response as ChatCompletion;
        const answer = unStreamResponse.choices?.[0]?.message?.content || '';

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
        historyPreview: getHistoryPreview(chatCompleteMessages, 10000),
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
      return Promise.reject(`您的 OpenAI key 出错了: ${JSON.stringify(requestBody)}`);
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
async function getChatMessages({
  datasetQuotePrompt,
  datasetQuoteText,
  useDatasetQuote,
  histories = [],
  systemPrompt,
  userChatInput,
  inputFiles,
  model,
  stringQuoteText
}: {
  datasetQuotePrompt?: string;
  datasetQuoteText: string;
  useDatasetQuote: boolean;
  histories: ChatItemType[];
  systemPrompt: string;
  userChatInput: string;
  inputFiles: UserChatItemValueItemType['file'][];
  model: LLMModelItemType;
  stringQuoteText?: string;
}) {
  const replaceInputValue = useDatasetQuote
    ? replaceVariable(datasetQuotePrompt || Prompt_QuotePromptList[0].value, {
        quote: datasetQuoteText,
        question: userChatInput
      })
    : userChatInput;

  const messages: ChatItemType[] = [
    ...getSystemPrompt(systemPrompt),
    ...(stringQuoteText
      ? getSystemPrompt(
          replaceVariable(Prompt_DocumentQuote, {
            quote: stringQuoteText
          })
        )
      : []),
    ...histories,
    {
      obj: ChatRoleEnum.Human,
      value: runtimePrompt2ChatsValue({
        files: inputFiles,
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
