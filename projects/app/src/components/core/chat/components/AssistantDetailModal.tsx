import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { Box, Flex, useDisclosure, ModalBody } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import {
  getChatResData,
  getAssistantRetrievalResults,
  getAssistantQuoteList
} from '@/web/core/chat/api';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import ChunkInfoCard from './ChunkInfoCard';
import FaqContentCard from './FaqContentCard';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import type {
  SearchDataResponseItemType,
  AssistantDatasetCiteItemType
} from '@fastgpt/global/core/dataset/type';
import Markdown from '@/components/Markdown';
import { removeDatasetCiteText } from '@fastgpt/service/core/ai/utils';

// 扩展类型，添加 score 字段和从 rawItem 中补充的字段
type AssistantDatasetCiteItemWithScore = AssistantDatasetCiteItemType & {
  score?: SearchDataResponseItemType['score'];
  datasetId?: string;
  collectionId?: string;
  sourceName?: string;
  index?: number;
};

interface ChatDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataId: string;
  appId: string;
  chatId?: string;
  outLinkAuthData?: any;
}

// 问题改写节点
const QuestionRewriteNode = ({ data }: { data?: ChatHistoryItemResType }) => {
  const { t } = useTranslation();
  const { copyData } = useCopyData();
  const { isOpen, onToggle } = useDisclosure({ defaultIsOpen: false });

  // 获取改写后的问题
  const rewrittenQuery = useMemo(() => {
    return data?.queryExtensionResult?.query || '';
  }, [data]);

  // 获取改写耗时
  const rewriteTime = useMemo(() => {
    const time = data?.queryExtensionResult?.rewriteTime || 0;
    return Number(time.toFixed(2));
  }, [data]);

  // 处理复制操作
  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation(); // 阻止事件冒泡，避免触发折叠/展开
      copyData(rewrittenQuery);
    },
    [copyData, rewrittenQuery]
  );

  return (
    <Box>
      <Flex
        alignItems={'center'}
        justifyContent={'space-between'}
        cursor={'pointer'}
        onClick={onToggle}
      >
        <Flex alignItems={'center'} flex={1}>
          <MyIcon
            name={isOpen ? 'common/solidChevronDown' : 'common/solidChevronRight'}
            w={'16px'}
            h={'16px'}
            color={'myGray.500'}
            mr={2}
          />
          <Box
            fontSize={'sm'}
            fontWeight={'medium'}
            color={'myGray.900'}
            display={'flex'}
            alignItems={'center'}
          >
            {t('chat:question_rewrite')}
            {rewrittenQuery && (
              <MyTooltip label={t('common:Copy')}>
                <Box
                  ml={1}
                  cursor={'pointer'}
                  onClick={handleCopy}
                  _hover={{ color: 'primary.600' }}
                >
                  <MyIcon name={'copy' as any} w={'16px'} h={'16px'} color={'myGray.600'} />
                </Box>
              </MyTooltip>
            )}
          </Box>
        </Flex>
        <Box fontSize={'xs'} color={'myGray.500'}>
          {rewriteTime}s
        </Box>
      </Flex>

      {isOpen && (
        <Box ml={2} pl={4} pt={2} pb={0} borderLeft={'1px dashed'} borderColor={'myGray.250'}>
          {rewrittenQuery ? (
            <Box
              borderRadius={'6px'}
              border={'1px solid'}
              borderColor={'borderColor.low'}
              p={'12px 16px'}
            >
              <Markdown source={rewrittenQuery} isDisabled />
            </Box>
          ) : (
            <Box fontSize={'sm'} color={'myGray.600'}>
              {t('chat:no_rewrite_needed')}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
};

// 知识召回节点
const KnowledgeRecallNode = ({
  data,
  retrievalResultsList,
  rawRetrievalResults,
  isLoading
}: {
  data?: ChatHistoryItemResType;
  retrievalResultsList?: AssistantDatasetCiteItemType[];
  rawRetrievalResults?: SearchDataResponseItemType[];
  isLoading?: boolean;
}) => {
  const { t } = useTranslation();
  const { isOpen, onToggle } = useDisclosure({ defaultIsOpen: false });

  // sourceType 显示文本映射 - 使用 useMemo 确保在 i18n 就绪后执行
  const SOURCE_TYPE_TEXT = useMemo(
    () => ({
      faq: t('chat:source_type_faq'),
      sql: t('chat:source_type_sql'),
      correction: t('chat:source_type_correction'),
      chunk: t('chat:source_type_chunk')
    }),
    [t]
  );

  // 计算知识召回总耗时 = retrievalTime + sqlRetrievalTime
  const recallTime = useMemo(() => {
    const retrievalTime = data?.retrievalTime || 0;
    const sqlRetrievalTime = data?.sqlRetrievalTime || 0;
    return Number((retrievalTime + sqlRetrievalTime).toFixed(2));
  }, [data]);

  // 合并数据：以 rawRetrievalResults 的顺序为主，遍历它并在 retrievalResultsList 中找到对应数据合并
  const mergedList = useMemo(() => {
    if (!rawRetrievalResults || rawRetrievalResults.length === 0) return [];
    if (!retrievalResultsList || retrievalResultsList.length === 0) return [];

    return rawRetrievalResults
      .map((rawItem) => {
        const apiItem = retrievalResultsList.find((r) => r._id === rawItem.id);
        if (!apiItem) return null;

        return {
          ...apiItem,
          datasetId: rawItem.datasetId,
          collectionId: rawItem.collectionId,
          sourceName: rawItem.sourceName,
          index: rawItem.chunkIndex,
          score: rawItem.score
        };
      })
      .filter(Boolean) as AssistantDatasetCiteItemWithScore[];
  }, [retrievalResultsList, rawRetrievalResults]);

  // 判断是否使用 FaqContentCard：只有当 datasetSearchNode 的 retrievalType 为 'correction' 或 'faq' 时
  const shouldUseFaqCard = data?.retrievalType === 'correction' || data?.retrievalType === 'faq';

  return (
    <Box>
      <Flex
        alignItems={'center'}
        justifyContent={'space-between'}
        cursor={'pointer'}
        onClick={onToggle}
      >
        <Flex alignItems={'center'} flex={1}>
          <MyIcon
            name={isOpen ? 'common/solidChevronDown' : 'common/solidChevronRight'}
            w={'16px'}
            h={'16px'}
            color={'myGray.500'}
            mr={2}
          />
          <Box fontSize={'sm'} fontWeight={'medium'} color={'myGray.900'}>
            {t('chat:knowledge_recall')}
          </Box>
        </Flex>
        <Box fontSize={'xs'} color={'myGray.500'}>
          {recallTime}s
        </Box>
      </Flex>

      {isOpen && (
        <Box ml={2} pl={4} pt={2} pb={0} borderLeft={'1px dashed'} borderColor={'myGray.250'}>
          <MyBox isLoading={isLoading} minH={isLoading ? '100px' : 'auto'}>
            {!isLoading && (
              <>
                {mergedList.length > 0 ? (
                  <Flex flexDirection={'column'} gap={3}>
                    {mergedList.map((item, index) => {
                      // 如果 datasetSearchNode 的 retrievalType 为 'correction' 或 'faq'，使用 FaqContentCard
                      if (shouldUseFaqCard) {
                        return (
                          <Box key={item._id || index}>
                            <FaqContentCard
                              q={item.q}
                              a={item.a || ''}
                              retrievalType={data?.retrievalType}
                            />
                          </Box>
                        );
                      }

                      // 构造描述列表 - 只显示全文检索和向量检索
                      const descriptionList: string[] = [];

                      // 从 score 数组中提取 fullText 和 embedding 分数，按固定顺序显示
                      if (item.score && Array.isArray(item.score)) {
                        const fullTextScore = item.score.find((s) => s.type === 'fullText');
                        const embeddingScore = item.score.find((s) => s.type === 'embedding');

                        if (fullTextScore) {
                          descriptionList.push(
                            `${t('chat:fulltext_search')}${fullTextScore.value.toFixed(4)}`
                          );
                        }
                        if (embeddingScore) {
                          descriptionList.push(
                            `${t('chat:vector_search')}${embeddingScore.value.toFixed(4)}`
                          );
                        }
                      }

                      // 根据 sourceType 获取标题文本
                      const title =
                        SOURCE_TYPE_TEXT[item.sourceType] || t('chat:source_type_chunk');

                      // 计算 linkText 和 linkUrl
                      let linkText = '';
                      let linkUrl = '';

                      if (item.sourceType === 'faq' || item.sourceType === 'chunk') {
                        linkText = `${item.sourceName || ''} / #${item.index}`;
                        linkUrl = `/dataset/detail?datasetId=${item.datasetId || ''}&collectionId=${item.collectionId || ''}&currentTab=dataCard&activeId=${item._id || ''}`;
                      } else if (item.sourceType === 'sql') {
                        linkText = item.sourceName || '';
                        linkUrl = `/dataset/detail?datasetId=${item.datasetId || ''}`;
                      }

                      return (
                        <ChunkInfoCard
                          key={item._id || index}
                          title={title}
                          descriptionList={descriptionList}
                          linkText={linkText}
                          linkUrl={linkUrl}
                          q={item.q}
                          a={item.a}
                        />
                      );
                    })}
                  </Flex>
                ) : (
                  <Box fontSize={'sm'} color={'myGray.600'}>
                    {t('chat:no_recall_content')}
                  </Box>
                )}
              </>
            )}
          </MyBox>
        </Box>
      )}
    </Box>
  );
};

// 知识重排节点
const KnowledgeRerankNode = ({
  data,
  quoteList,
  rawQuoteList,
  rawRetrievalResults,
  isLoading
}: {
  data?: ChatHistoryItemResType;
  quoteList?: AssistantDatasetCiteItemType[];
  rawQuoteList?: SearchDataResponseItemType[];
  rawRetrievalResults?: SearchDataResponseItemType[];
  isLoading?: boolean;
}) => {
  const { t } = useTranslation();
  const { isOpen, onToggle } = useDisclosure({ defaultIsOpen: false });

  // sourceType 显示文本映射 - 使用 useMemo 确保在 i18n 就绪后执行
  const SOURCE_TYPE_TEXT = useMemo(
    () => ({
      faq: t('chat:source_type_faq'),
      sql: t('chat:source_type_sql'),
      correction: t('chat:source_type_correction'),
      chunk: t('chat:source_type_chunk')
    }),
    [t]
  );

  // 获取重排耗时
  const rerankTime = useMemo(() => {
    const time = data?.rerankTime || 0;
    return Number(time.toFixed(2));
  }, [data]);

  // 合并数据：以 rawQuoteList 的顺序为主，遍历它并在 quoteList 中找到对应数据合并
  const mergedList = useMemo(() => {
    if (!rawQuoteList || rawQuoteList.length === 0) return [];
    if (!quoteList || quoteList.length === 0) return [];

    return rawQuoteList
      .map((rawItem) => {
        const apiItem = quoteList.find((r) => r._id === rawItem.id);
        if (!apiItem) return null;

        return {
          ...apiItem,
          datasetId: rawItem.datasetId,
          collectionId: rawItem.collectionId,
          sourceName: rawItem.sourceName,
          index: rawItem.chunkIndex,
          score: rawItem.score
        };
      })
      .filter(Boolean) as AssistantDatasetCiteItemWithScore[];
  }, [quoteList, rawQuoteList]);

  // 判断是否使用重排:从 data 中获取 searchUsingReRank
  const searchUsingReRank = data?.searchUsingReRank || false;

  // 当未使用重排时，隐藏知识重排节点
  if (!searchUsingReRank) return null;

  return (
    <Box>
      <Flex
        alignItems={'center'}
        justifyContent={'space-between'}
        cursor={'pointer'}
        onClick={onToggle}
      >
        <Flex alignItems={'center'} flex={1}>
          <MyIcon
            name={isOpen ? 'common/solidChevronDown' : 'common/solidChevronRight'}
            w={'16px'}
            h={'16px'}
            color={'myGray.500'}
            mr={2}
          />
          <Box fontSize={'sm'} fontWeight={'medium'} color={'myGray.900'}>
            {t('chat:knowledge_rerank')}
          </Box>
        </Flex>
        <Box fontSize={'xs'} color={'myGray.500'}>
          {rerankTime}s
        </Box>
      </Flex>

      {isOpen && (
        <Box ml={2} pl={4} pt={2} pb={0} borderLeft={'1px dashed'} borderColor={'myGray.250'}>
          <MyBox isLoading={isLoading} minH={isLoading ? '100px' : 'auto'}>
            {!isLoading && (
              <>
                {mergedList.length > 0 ? (
                  <Flex flexDirection={'column'} gap={3}>
                    {mergedList.map((item, index) => {
                      // 构造描述列表 - 显示综合分数、重排分数和召回排名，按固定顺序显示
                      const descriptionList = [];

                      // 从 score 数组中提取分数信息，按固定顺序添加
                      if (item.score && Array.isArray(item.score)) {
                        const rrfScore = item.score.find((s) => s.type === 'rrf');
                        const reRankScore = item.score.find((s) => s.type === 'reRank');

                        if (rrfScore) {
                          descriptionList.push(
                            `${t('chat:combined_score')}${rrfScore.value.toFixed(4)}`
                          );
                        }
                        if (reRankScore) {
                          descriptionList.push(
                            `${t('chat:rerank_score')}${reRankScore.value.toFixed(4)}`
                          );
                        }
                      }

                      // 计算召回排名：根据 id 在 rawRetrievalResults 中的位置
                      let recallRank = '-';
                      if (rawRetrievalResults && item._id) {
                        const rankIndex = rawRetrievalResults.findIndex((r) => r.id === item._id);
                        if (rankIndex !== -1) {
                          recallRank = `${rankIndex + 1}`;
                        }
                      }
                      descriptionList.push(`${t('chat:recall_rank')}${recallRank}`);

                      // 根据 sourceType 获取标题文本
                      const title =
                        SOURCE_TYPE_TEXT[item.sourceType] || t('chat:source_type_chunk');

                      // 计算 linkText 和 linkUrl
                      let linkText = '';
                      let linkUrl = '';

                      if (item.sourceType === 'faq' || item.sourceType === 'chunk') {
                        linkText = `${item.sourceName || ''} / #${item.index}`;
                        linkUrl = `/dataset/detail?datasetId=${item.datasetId || ''}&collectionId=${item.collectionId || ''}&currentTab=dataCard&activeId=${item._id || ''}`;
                      } else if (item.sourceType === 'sql') {
                        linkText = item.sourceName || '';
                        linkUrl = `/dataset/detail?datasetId=${item.datasetId || ''}`;
                      }

                      return (
                        <ChunkInfoCard
                          key={item._id || index}
                          title={title}
                          descriptionList={descriptionList}
                          linkText={linkText}
                          linkUrl={linkUrl}
                          q={item.q}
                          a={item.a}
                        />
                      );
                    })}
                  </Flex>
                ) : (
                  <Box fontSize={'sm'} color={'myGray.600'}>
                    {t('chat:no_rerank_passed')}
                  </Box>
                )}
              </>
            )}
          </MyBox>
        </Box>
      )}
    </Box>
  );
};

// 最终回答节点
const FinalAnswerNode = ({
  data,
  totalRunningTime,
  isFallback,
  chatNodeData
}: {
  data?: ChatHistoryItemResType;
  totalRunningTime?: number;
  isFallback?: boolean;
  chatNodeData?: ChatHistoryItemResType;
}) => {
  const { t } = useTranslation();
  const { copyData } = useCopyData();
  const { isOpen, onToggle } = useDisclosure({ defaultIsOpen: false });

  // 获取最终回答文本
  const finalAnswer = useMemo(() => {
    let rawValue = '';

    // 如果是兜底回复，使用 answerNode 的 textOutput
    if (isFallback) {
      rawValue = data?.textOutput || '';
    } else if (chatNodeData?.historyPreview && Array.isArray(chatNodeData.historyPreview)) {
      // 否则从 chatNode 的 historyPreview 中获取最后一个 AI 对话的 value
      const aiMessages = chatNodeData.historyPreview.filter((msg: any) => msg.obj === 'AI');
      if (aiMessages.length > 0) {
        rawValue = aiMessages[aiMessages.length - 1].value;
      } else if (chatNodeData?.errorText) {
        // 如果存在 chatNodeData 但没取到 aiMessage，且存在 errorText，显示 errorText
        rawValue = chatNodeData.errorText;
      }
    } else {
      // 兜底：使用 answerNode 的 textOutput
      rawValue = data?.textOutput || '';
    }

    // 使用 removeDatasetCiteText 处理文本，移除数据集引用标记
    return removeDatasetCiteText(rawValue, false);
  }, [data, isFallback, chatNodeData]);

  // 判断是否为错误状态
  const isError = useMemo(() => {
    if (isFallback) return false;
    if (!chatNodeData) return false;

    // 判断是否有 AI 消息
    const hasAiMessage =
      chatNodeData.historyPreview &&
      Array.isArray(chatNodeData.historyPreview) &&
      chatNodeData.historyPreview.some((msg: any) => msg.obj === 'AI');

    // 存在 errorText 且没有 AI 消息时为错误状态
    return !!chatNodeData.errorText && !hasAiMessage;
  }, [isFallback, chatNodeData]);

  // 处理复制操作
  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation(); // 阻止事件冒泡，避免触发折叠/展开
      copyData(finalAnswer);
    },
    [copyData, finalAnswer]
  );

  return (
    <Box>
      <Flex
        alignItems={'center'}
        justifyContent={'space-between'}
        cursor={'pointer'}
        onClick={onToggle}
      >
        <Flex alignItems={'center'} flex={1}>
          <MyIcon
            name={isOpen ? 'common/solidChevronDown' : 'common/solidChevronRight'}
            w={'16px'}
            h={'16px'}
            color={'myGray.500'}
            mr={2}
          />
          <Box
            fontSize={'sm'}
            fontWeight={'medium'}
            color={'myGray.900'}
            display={'flex'}
            alignItems={'center'}
          >
            {t('chat:final_answer')}
            {finalAnswer && !isError && (
              <MyTooltip label={t('common:Copy')}>
                <Box
                  ml={1}
                  cursor={'pointer'}
                  onClick={handleCopy}
                  _hover={{ color: 'primary.600' }}
                >
                  <MyIcon name={'copy' as any} w={'16px'} h={'16px'} color={'myGray.600'} />
                </Box>
              </MyTooltip>
            )}
            {isError && (
              <MyIcon name={'common/error'} w={'16px'} h={'16px'} color={'red.600'} ml={1} />
            )}
          </Box>
        </Flex>
        <Box fontSize={'xs'} color={'myGray.500'}>
          {totalRunningTime || 0}s
        </Box>
      </Flex>

      {isOpen && (
        <Box ml={2} pl={4} pt={2} pb={0} borderLeft={'1px dashed'} borderColor={'myGray.250'}>
          {finalAnswer && (
            <>
              {/* 兜底回复说明文本 */}
              {isFallback && (
                <Box fontSize={'12px'} lineHeight={'16px'} color={'myGray.600'} mb={2}>
                  {t('chat:fallback_reply')}
                </Box>
              )}
              {/* 错误状态：直接显示错误文本，不带边框 */}
              {isError ? (
                <Box fontSize={'sm'} color={'red.600'}>
                  {finalAnswer}
                </Box>
              ) : (
                <Box
                  borderRadius={'6px'}
                  border={'1px solid'}
                  borderColor={'borderColor.low'}
                  p={'12px'}
                >
                  <Box fontSize={'14px'} lineHeight={'22px'} color={'myGray.600'}>
                    <Markdown source={finalAnswer} isDisabled />
                  </Box>
                </Box>
              )}
            </>
          )}
        </Box>
      )}
    </Box>
  );
};

const ChatDetailModal = ({
  isOpen,
  onClose,
  dataId,
  appId,
  chatId,
  outLinkAuthData = {}
}: ChatDetailModalProps) => {
  const { t } = useTranslation();
  const [workflowNodes, setWorkflowNodes] = useState<ChatHistoryItemResType[]>([]);
  const [loading, setLoading] = useState(false);

  // 从 workflowNodes 中获取用户问题
  const userQuestion = useMemo(() => {
    const datasetSearchNode = workflowNodes.find(
      (node) => node.moduleType === FlowNodeTypeEnum.datasetSearchNode
    );
    return (datasetSearchNode?.['query'] as string) || '';
  }, [workflowNodes]);

  // 提取知识库搜索节点的 retrievalResults（用于知识召回）
  const retrievalResults = useMemo(() => {
    const datasetSearchNode = workflowNodes.find(
      (node) => node.moduleType === FlowNodeTypeEnum.datasetSearchNode
    );
    return datasetSearchNode?.retrievalResults || [];
  }, [workflowNodes]);

  // 提取知识库搜索节点的 quoteList（用于知识重排）
  const quoteList = useMemo(() => {
    const datasetSearchNode = workflowNodes.find(
      (node) => node.moduleType === FlowNodeTypeEnum.datasetSearchNode
    );
    return datasetSearchNode?.quoteList || [];
  }, [workflowNodes]);

  // 判断是否为 correction 或 faq 类型
  const isCorrectionOrFaq = useMemo(() => {
    const datasetSearchNode = workflowNodes.find(
      (node) => node.moduleType === FlowNodeTypeEnum.datasetSearchNode
    );
    const retrievalType = datasetSearchNode?.retrievalType;
    return retrievalType === 'correction' || retrievalType === 'faq';
  }, [workflowNodes]);

  // 提取 datasetDataIdList 和 collectionIdList 的辅助函数
  const extractIds = useCallback((list: SearchDataResponseItemType[]) => {
    const datasetDataIdList = list.map((item) => item.id).filter((v): v is string => !!v);
    const collectionIdList = [
      ...new Set(list.map((item) => item.collectionId).filter((v): v is string => !!v))
    ];
    return { datasetDataIdList, collectionIdList };
  }, []);

  // 从 retrievalResults 提取 ID 列表（用于知识召回）
  const {
    datasetDataIdList: retrievalDatasetDataIdList,
    collectionIdList: retrievalCollectionIdList
  } = useMemo(() => extractIds(retrievalResults), [retrievalResults, extractIds]);

  // 从 quoteList 提取 ID 列表（用于知识重排）
  const { datasetDataIdList: quoteDatasetDataIdList, collectionIdList: quoteCollectionIdList } =
    useMemo(() => extractIds(quoteList), [quoteList, extractIds]);

  // chatItemDataId 就是当前对话记录的 dataId
  const chatItemDataId = dataId;

  // 计算知识库搜索节点后的所有节点的 runningTime 总和
  const finalAnswerTotalRunningTime = useMemo(() => {
    const datasetSearchNodeIndex = workflowNodes.findIndex(
      (node) => node.moduleType === FlowNodeTypeEnum.datasetSearchNode
    );

    if (datasetSearchNodeIndex === -1) return 0;

    // 获取知识库搜索节点之后的所有节点
    const nodesAfterDatasetSearch = workflowNodes.slice(datasetSearchNodeIndex + 1);

    // 计算这些节点的 runningTime 总和
    const totalTime = nodesAfterDatasetSearch.reduce((total, node) => {
      return total + (node.runningTime || 0);
    }, 0);

    return Number(totalTime.toFixed(2));
  }, [workflowNodes]);

  // 通过 API 获取知识召回的完整数据（包含 q、a 等字段）
  const { data: retrievalResultsList = [], loading: retrievalLoading } = useRequest2(
    async () =>
      !!chatItemDataId && !!chatId && retrievalDatasetDataIdList.length > 0
        ? await getAssistantRetrievalResults({
            datasetDataIdList: retrievalDatasetDataIdList,
            collectionIdList: retrievalCollectionIdList,
            chatId,
            chatItemDataId,
            appId,
            ...outLinkAuthData
          })
        : [],
    {
      refreshDeps: [
        retrievalDatasetDataIdList.length,
        retrievalCollectionIdList.length,
        chatItemDataId
      ],
      manual: false
    }
  ) as { data: AssistantDatasetCiteItemType[]; loading: boolean };

  // 通过 API 获取知识重排的完整数据（包含 q、a 等字段）
  const { data: rerankQuoteList = [], loading: rerankLoading } = useRequest2(
    async () =>
      !!chatItemDataId && !!chatId && quoteDatasetDataIdList.length > 0
        ? await getAssistantQuoteList({
            datasetDataIdList: quoteDatasetDataIdList,
            collectionIdList: quoteCollectionIdList,
            chatId,
            chatItemDataId,
            appId,
            ...outLinkAuthData
          })
        : [],
    {
      refreshDeps: [quoteDatasetDataIdList.length, quoteCollectionIdList.length, chatItemDataId],
      manual: false
    }
  ) as { data: AssistantDatasetCiteItemType[]; loading: boolean };

  // 获取历史响应数据
  const fetchHistoryResponseData = useCallback(async () => {
    if (!isOpen || !dataId || !appId) return;

    setLoading(true);
    try {
      const response = await getChatResData({
        chatId,
        dataId,
        appId,
        ...outLinkAuthData
      });
      setWorkflowNodes(response || []);
    } catch (error) {
      console.error('Failed to fetch history response data:', error);
      setWorkflowNodes([]);
    } finally {
      setLoading(false);
    }
  }, [isOpen, dataId, appId, chatId, outLinkAuthData]);

  // 当弹窗打开时自动获取数据
  useEffect(() => {
    fetchHistoryResponseData();
  }, [fetchHistoryResponseData]);

  return (
    <MyModal
      isCentered
      isOpen={isOpen}
      onClose={onClose}
      minW={['90vw', '900px']}
      maxH={['90vh', '700px']}
      h={['90vh', '80vh']}
      isLoading={loading}
      iconSrc="/imgs/modal/wholeRecord.svg"
      title={t('chat:chat_details')}
    >
      <ModalBody>
        {!loading && (
          <>
            {/* 用户问题区域 */}
            <Box bg={'primary.50'} px={4} py={3} mb={4} borderRadius={'semilg'}>
              <Box fontSize={'sm'} lineHeight={'22px'} color={'myGray.900'} whiteSpace={'pre-wrap'}>
                {userQuestion}
              </Box>
            </Box>

            {/* 工作流节点列表 - 固定四个节点 */}
            <Box flex={1} overflow={'auto'} display={'flex'} flexDirection={'column'} gap={6}>
              <QuestionRewriteNode
                data={workflowNodes.find(
                  (node) => node.moduleType === FlowNodeTypeEnum.datasetSearchNode
                )}
              />
              <KnowledgeRecallNode
                data={workflowNodes.find(
                  (node) => node.moduleType === FlowNodeTypeEnum.datasetSearchNode
                )}
                retrievalResultsList={isCorrectionOrFaq ? rerankQuoteList : retrievalResultsList}
                rawRetrievalResults={isCorrectionOrFaq ? quoteList : retrievalResults}
                isLoading={isCorrectionOrFaq ? rerankLoading : retrievalLoading}
              />
              {!isCorrectionOrFaq && (
                <KnowledgeRerankNode
                  data={workflowNodes.find(
                    (node) => node.moduleType === FlowNodeTypeEnum.datasetSearchNode
                  )}
                  quoteList={rerankQuoteList}
                  rawQuoteList={quoteList}
                  rawRetrievalResults={retrievalResults}
                  isLoading={rerankLoading}
                />
              )}
              <FinalAnswerNode
                data={workflowNodes.find((node) => node.moduleType === FlowNodeTypeEnum.answerNode)}
                totalRunningTime={finalAnswerTotalRunningTime}
                isFallback={!quoteList || quoteList.length === 0}
                chatNodeData={workflowNodes.find(
                  (node) => node.moduleType === FlowNodeTypeEnum.chatNode
                )}
              />
            </Box>
          </>
        )}
      </ModalBody>
    </MyModal>
  );
};

export default ChatDetailModal;
