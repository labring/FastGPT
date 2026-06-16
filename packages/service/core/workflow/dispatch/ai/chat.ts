import { filterGPTMessageByMaxContext } from '../../../ai/llm/utils';
import type { ChatItemMiniType, UserChatItemFileItemType } from '@fastgpt/global/core/chat/type';
import type { UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
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
import {
  getQuoteTemplate,
  getQuotePrompt,
  getDocumentQuotePrompt
} from '@fastgpt/global/core/ai/prompt/AIChat';
import type { AIChatNodeProps } from '@fastgpt/global/core/workflow/runtime/type';
import { replaceVariable } from '@fastgpt/global/common/string/tools';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { getLLMModelById } from '../../../ai/model';
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
import { parseUrlToFileType } from '../../utils/context';
import { i18nT } from '../../../../../global/common/i18n/utils';
import { postTextCensor } from '../../../chat/postTextCensor';
import { createLLMResponse } from '../../../ai/llm/request';
import { compressLargeContent } from '../../../ai/llm/compress';
import { countPromptTokens } from '../../../../common/string/tiktoken';
import { env } from '../../../../env';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { addLog } from '../../../../common/system/log';
import {
  extractQuerySynonyms,
  mergeSynonymMappings,
  buildSynonymMappingPrompt
} from '../../../dataset/search/synonym';

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
      modelId,
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

  const modelConstantsData = getLLMModelById(modelId);
  if (!modelConstantsData) {
    return getNodeErrResponse({
      error: `Model ${modelId} not found`
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

    // Debug日志：记录从知识库检索节点接收到的完整数据
    addLog.debug('AI Chat - Received Dataset Quote Data', {
      quoteQACount: quoteQA?.length || 0,
      quoteQAIds: quoteQA?.map((item) => item.id) || [],
      quoteQASummary:
        quoteQA?.map((item, index) => ({
          index,
          id: item.id,
          datasetId: item.datasetId,
          sourceName: item.sourceName,
          q: item.q,
          a: item.a
        })) || []
    });

    const [{ datasetQuoteText, synonymMappingsText }, { documentQuoteText, userFiles }] =
      await Promise.all([
        filterDatasetQuote({
          quoteQA,
          model: modelConstantsData,
          quoteTemplate: quoteTemplate || getQuoteTemplate(version),
          userChatInput
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

    // Auto-compress ultra-long user input before getChatMessages
    let finalUserInput = userChatInput;
    let compressionMeta: {
      originalText: string;
      compressedText: string;
      usage?: ChatNodeUsageType;
    } | null = null;

    if (userChatInput) {
      const inputTokens = await countPromptTokens(userChatInput);
      const threshold = Math.floor(
        modelConstantsData.maxContext * env.USER_INPUT_COMPRESS_THRESHOLD
      );

      if (inputTokens > threshold) {
        const targetTokens = Math.floor(
          modelConstantsData.maxContext * env.USER_INPUT_COMPRESS_TARGET
        );

        addLog.debug('User input auto-compression triggered', {
          inputTokens,
          threshold,
          targetTokens
        });

        const result = await compressLargeContent({
          content: userChatInput,
          model: modelConstantsData,
          maxTokens: targetTokens,
          userKey: externalProvider.openaiAccount
        });

        if (result.compressed && result.compressed !== userChatInput) {
          finalUserInput = result.compressed;
          compressionMeta = {
            originalText: userChatInput,
            compressedText: result.compressed,
            usage: result.usage
          };

          if (result.usage) {
            props.usagePush([result.usage]);
          }

          addLog.debug('User input auto-compression completed', {
            originalTokens: inputTokens,
            moduleName: result.usage?.moduleName
          });
        }
      }
    }

    const [{ filterMessages }] = await Promise.all([
      getChatMessages({
        model: modelConstantsData,
        maxTokens: max_tokens,
        histories: chatHistories,
        useDatasetQuote: quoteQA !== undefined,
        datasetQuoteText,
        synonymMappingsText,
        aiChatQuoteRole,
        datasetQuotePrompt: quotePrompt,
        version,
        userChatInput: finalUserInput,
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
        modelId: modelConstantsData.id,
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
      modelId: modelConstantsData.id,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens
    });
    const points = externalProvider.openaiAccount?.key ? 0 : totalPoints;
    props.usagePush([
      {
        moduleName: name,
        totalPoints: points,
        modelId: modelConstantsData.id,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens
      }
    ]);

    const chatCompleteMessages = GPTMessages2Chats({ messages: completeMessages });

    // Inject compression metadata for UI display and persistence
    if (compressionMeta) {
      // Inject into query array (shared references with userQuestion.value used by save function)
      if (query && Array.isArray(query) && query.length > 0) {
        const firstQueryValue = query[0];
        if (firstQueryValue?.text) {
          firstQueryValue.text.originalContent = compressionMeta.originalText;
          firstQueryValue.text.content = compressionMeta.compressedText;
          (firstQueryValue as any).compression = {
            modelId: modelConstantsData.id,
            inputTokens: compressionMeta.usage?.inputTokens,
            outputTokens: compressionMeta.usage?.outputTokens
          };
        }
      }

      // Also inject into chatCompleteMessages for downstream consumers
      for (let i = chatCompleteMessages.length - 1; i >= 0; i--) {
        const msg = chatCompleteMessages[i];
        if (msg.obj === ChatRoleEnum.Human) {
          const firstValue = msg.value?.[0] as UserChatItemValueItemType | undefined;
          if (firstValue?.text) {
            firstValue.text.originalContent = compressionMeta.originalText;
            firstValue.text.content = compressionMeta.compressedText;
            firstValue.compression = {
              modelId: modelConstantsData.id,
              inputTokens: compressionMeta.usage?.inputTokens,
              outputTokens: compressionMeta.usage?.outputTokens
            };
          }
          break;
        }
      }
    }

    if (error) {
      return getNodeErrResponse({
        error,
        responseData: {
          totalPoints: points,
          modelId: modelConstantsData.id,
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
        modelId: modelConstantsData.id,
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

async function filterDatasetQuote({
  quoteQA = [],
  model,
  quoteTemplate,
  userChatInput
}: {
  quoteQA: ChatProps['params']['quoteQA'];
  model: LLMModelItemType;
  quoteTemplate: string;
  userChatInput: string;
}) {
  // slice filterSearch
  const filterQuoteQA = await filterSearchResultsByMaxChars(quoteQA, model.quoteMaxToken);

  // 收集 chunk 来源的同义词映射（已挂在每个 item 上）
  const chunkSynonymMappings = filterQuoteQA.flatMap((item) => item.synonymMappings ?? []);

  // 收集去重的 datasetIds，用于查询 query 来源的同义词
  const datasetIds = [...new Set(filterQuoteQA.map((item) => item.datasetId).filter(Boolean))];

  // 查询 query 命中的同义词映射
  const querySynonymMappings = await extractQuerySynonyms(userChatInput, datasetIds);

  // 合并 chunk + query 两路同义词，去重
  const mergedSynonymMappings = mergeSynonymMappings([
    ...chunkSynonymMappings,
    ...querySynonymMappings
  ]);

  // 格式化为可读的提示文本
  const synonymMappingsText = buildSynonymMappingPrompt(mergedSynonymMappings);

  function getValue({ item, index }: { item: SearchDataResponseItemType; index: number }) {
    // Filter out SQL content for sql_quote items to prevent interference with LLM generation
    const isSqlQuote = item.id.startsWith('sql_quote_');

    return replaceVariable(quoteTemplate, {
      id: item.id,
      q: item.q,
      a: isSqlQuote ? '' : item.a || '',
      updateTime: formatTime2YMDHM(item.updateTime),
      source: item.sourceName,
      sourceId: String(item.sourceId || ''),
      index: index + 1,
      synonymMappings: item.synonymMappings ? buildSynonymMappingPrompt(item.synonymMappings) : ''
    });
  }

  const datasetQuoteText =
    filterQuoteQA.length > 0
      ? `${filterQuoteQA.map((item, index) => getValue({ item, index }).trim()).join('\n------\n')}`
      : '';

  addLog.debug('AI Chat - Final Dataset Quote Text', {
    quoteTextLength: datasetQuoteText.length,
    quoteTextPreview: datasetQuoteText,
    synonymMappingsText
  });

  return {
    datasetQuoteText,
    synonymMappingsText
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
  histories: ChatItemMiniType[];
  inputFiles: UserChatItemFileItemType[];
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
    userFiles: fileLinks
      .map((url) => parseUrlToFileType(url))
      .filter(Boolean) as UserChatItemFileItemType[]
  };
}

async function getChatMessages({
  model,
  maxTokens = 0,
  aiChatQuoteRole,
  datasetQuotePrompt = '',
  datasetQuoteText,
  synonymMappingsText = '',
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
  synonymMappingsText?: string;
  version?: string;

  useDatasetQuote: boolean;
  histories: ChatItemMiniType[];
  systemPrompt: string;
  userChatInput: string;

  userFiles: UserChatItemFileItemType[];
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
          synonymMappings: synonymMappingsText,
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
          quote: datasetQuoteText,
          synonymMappings: synonymMappingsText
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

  // 兜底替换：确保所有占位符都被替换，即使未使用数据集引用
  const finalSystemPrompt = replaceVariable(concatenateSystemPrompt, {
    synonymMappings: synonymMappingsText || ''
  });

  const finalUserInput = replaceVariable(replaceInputValue, {
    synonymMappings: synonymMappingsText || ''
  });

  const messages: ChatItemMiniType[] = [
    ...getSystemPrompt_ChatItemType(concatenateSystemPrompt),
    ...histories,
    {
      obj: ChatRoleEnum.Human,
      value: runtimePrompt2ChatsValue({
        files: userFiles,
        text: finalUserInput
      })
    }
  ];

  const adaptMessages = chats2GPTMessages({
    messages,
    reserveId: false
  });

  const filterMessages = await filterGPTMessageByMaxContext({
    messages: adaptMessages,
    maxContext: model.maxContext - maxTokens // filter token. not response maxToken
  });

  // Debug日志：记录最终发送给LLM的消息
  addLog.debug('AI Chat - Final Messages to LLM', {
    totalMessagesCount: filterMessages.length,
    messages: filterMessages.map((msg, index) => ({
      index,
      role: msg.role,
      contentLength:
        typeof msg.content === 'string'
          ? msg.content.length
          : JSON.stringify(msg.content)?.length ?? 0,
      content: msg.content
    }))
  });

  return {
    filterMessages
  };
}
