import type { NextApiResponse } from 'next';
import {
  filterGPTMessageByMaxTokens,
  formatGPTMessagesInRequestBefore,
  loadChatImgToBase64
} from '../../../chat/utils';
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
import {
  countGptMessagesTokens,
  countMessagesTokens
} from '../../../../common/string/tiktoken/index';
import {
  chats2GPTMessages,
  chatValue2RuntimePrompt,
  getSystemPrompt,
  GPTMessages2Chats,
  runtimePrompt2ChatsValue
} from '@fastgpt/global/core/chat/adapt';
import {
  Prompt_QuotePromptList,
  Prompt_QuoteTemplateList
} from '@fastgpt/global/core/ai/prompt/AIChat';
import type { AIChatNodeProps } from '@fastgpt/global/core/workflow/runtime/type.d';
import { replaceVariable } from '@fastgpt/global/common/string/tools';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/type/index.d';
import { responseWrite, responseWriteController } from '../../../../common/response';
import { getLLMModel, ModelTypeEnum } from '../../../ai/model';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { getHistories } from '../utils';
import { filterSearchResultsByMaxChars } from '../../utils';
import { getHistoryPreview } from '@fastgpt/global/core/chat/utils';
import { addLog } from '../../../../common/system/log';

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
    stream = false,
    detail = false,
    user,
    histories,
    node: { name },
    query,
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
      quotePrompt
    }
  } = props;
  const { files: inputFiles } = chatValue2RuntimePrompt(query);

  if (!userChatInput && inputFiles.length === 0) {
    return Promise.reject('Question is empty');
  }
  stream = stream && isResponseAnswerText;

  const chatHistories = getHistories(history, histories);

  // temperature adapt
  const modelConstantsData = getLLMModel(model);

  if (!modelConstantsData) {
    return Promise.reject('The chat model is undefined, you need to select a chat model.');
  }

  const { quoteText } = await filterQuote({
    quoteQA,
    model: modelConstantsData,
    quoteTemplate
  });

  // censor model and system key
  if (modelConstantsData.censor && !user.openaiAccount?.key) {
    await postTextCensor({
      text: `${systemPrompt}
      ${quoteText}
      ${userChatInput}
      `
    });
  }

  const { filterMessages } = await getChatMessages({
    model: modelConstantsData,
    histories: chatHistories,
    quoteQA,
    quoteText,
    quotePrompt,
    userChatInput,
    inputFiles,
    systemPrompt
  });

  const { max_tokens } = await getMaxTokens({
    model: modelConstantsData,
    maxToken,
    filterMessages
  });

  // FastGPT temperature range: 1~10
  temperature = +(modelConstantsData.maxTemperature * (temperature / 10)).toFixed(2);
  temperature = Math.max(temperature, 0.01);
  const ai = getAIApi({
    userKey: user.openaiAccount,
    timeout: 480000
  });

  const concatMessages = [
    ...(modelConstantsData.defaultSystemChatPrompt
      ? [
          {
            role: ChatCompletionRequestMessageRoleEnum.System,
            content: modelConstantsData.defaultSystemChatPrompt
          }
        ]
      : []),
    ...formatGPTMessagesInRequestBefore(filterMessages)
  ] as ChatCompletionMessageParam[];

  if (concatMessages.length === 0) {
    return Promise.reject('core.chat.error.Messages empty');
  }

  const loadMessages = await Promise.all(
    concatMessages.map(async (item) => {
      if (item.role === ChatCompletionRequestMessageRoleEnum.User) {
        return {
          ...item,
          content: await loadChatImgToBase64(item.content)
        };
      } else {
        return item;
      }
    })
  );

  const requestBody = {
    ...modelConstantsData?.defaultConfig,
    model: modelConstantsData.model,
    temperature,
    max_tokens,
    stream,
    messages: loadMessages
  };
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
        detail,
        stream: response,
        requestBody
      });

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

  const completeMessages = filterMessages.concat({
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
      historyPreview: getHistoryPreview(chatCompleteMessages),
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
};

async function filterQuote({
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

  const quoteText =
    filterQuoteQA.length > 0
      ? `${filterQuoteQA.map((item, index) => getValue(item, index).trim()).join('\n------\n')}`
      : '';

  return {
    quoteText
  };
}
async function getChatMessages({
  quotePrompt,
  quoteText,
  quoteQA,
  histories = [],
  systemPrompt,
  userChatInput,
  inputFiles,
  model
}: {
  quotePrompt?: string;
  quoteText: string;
  quoteQA: ChatProps['params']['quoteQA'];
  histories: ChatItemType[];
  systemPrompt: string;
  userChatInput: string;
  inputFiles: UserChatItemValueItemType['file'][];
  model: LLMModelItemType;
}) {
  const replaceInputValue =
    quoteQA !== undefined
      ? replaceVariable(quotePrompt || Prompt_QuotePromptList[0].value, {
          quote: quoteText,
          question: userChatInput
        })
      : userChatInput;

  const messages: ChatItemType[] = [
    ...getSystemPrompt(systemPrompt),
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
async function getMaxTokens({
  maxToken,
  model,
  filterMessages = []
}: {
  maxToken: number;
  model: LLMModelItemType;
  filterMessages: ChatCompletionMessageParam[];
}) {
  maxToken = Math.min(maxToken, model.maxResponse);
  const tokensLimit = model.maxContext;

  /* count response max token */
  const promptsToken = await countGptMessagesTokens(filterMessages);
  maxToken = promptsToken + maxToken > tokensLimit ? tokensLimit - promptsToken : maxToken;

  if (maxToken <= 0) {
    maxToken = 200;
  }
  return {
    max_tokens: maxToken
  };
}

async function streamResponse({
  res,
  detail,
  stream,
  requestBody
}: {
  res: NextApiResponse;
  detail: boolean;
  stream: StreamChatType;
  requestBody: Record<string, any>;
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

    responseWrite({
      write,
      event: detail ? SseResponseEventEnum.answer : undefined,
      data: textAdaptGptResponse({
        text: content
      })
    });
  }

  if (!answer) {
    addLog.info(`LLM model response empty`, requestBody);
    return Promise.reject('core.chat.Chat API is error or undefined');
  }

  return { answer };
}
