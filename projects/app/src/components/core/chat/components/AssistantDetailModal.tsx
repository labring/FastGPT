import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { Box, Flex, useDisclosure, ModalBody } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyIcon from '@fastgpt/web/components/common/Icon';
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
import { isDatabaseSource } from '@fastgpt/global/core/dataset/utils';
import { isCorrectionRecord } from '@/global/core/chat/utils';
import type {
  SearchDataResponseItemType,
  DatasetCiteItemType,
  AssistantDatasetCiteItemType
} from '@fastgpt/global/core/dataset/type';
import QuoteItem, { formatScore } from '@/components/core/dataset/QuoteItem';
import Markdown from '@/components/Markdown';
import { t } from 'i18next';

// 扩展类型，添加 score 字段
type AssistantDatasetCiteItemWithScore = AssistantDatasetCiteItemType & {
  score?: SearchDataResponseItemType['score'];
};

// sourceType 显示文本映射
const SOURCE_TYPE_TEXT = {
  faq: t('chat:source_type_faq'),
  sql: t('chat:source_type_sql'),
  correction: t('chat:source_type_correction'),
  chunk: t('chat:source_type_chunk')
} as const;

interface ChatDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataId: string;
  appId: string;
  chatId?: string;
  chatTime?: Date;
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
          {data?.runningTime || 0}s
        </Box>
      </Flex>

      {isOpen && (
        <Box ml={2} pl={4} pt={2} pb={0} borderLeft={'1px dashed'} borderColor={'myGray.250'}>
          {rewrittenQuery && (
            <Box
              borderRadius={'6px'}
              border={'1px solid'}
              borderColor={'borderColor.low'}
              p={'12px 16px'}
            >
              <Box fontSize={'14px'} color={'myGray.600'}>
                {rewrittenQuery}
              </Box>
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
  rawRetrievalResults
}: {
  data?: ChatHistoryItemResType;
  retrievalResultsList?: AssistantDatasetCiteItemType[];
  rawRetrievalResults?: SearchDataResponseItemType[];
}) => {
  const { t } = useTranslation();
  const { isOpen, onToggle } = useDisclosure({ defaultIsOpen: false });

  // 合并数据：将 API 返回的完整数据与原始的 retrievalResults 合并，以获取 score 信息
  const mergedList = useMemo(() => {
    if (!retrievalResultsList || retrievalResultsList.length === 0) return [];
    if (!rawRetrievalResults || rawRetrievalResults.length === 0) return retrievalResultsList;

    return retrievalResultsList.map((apiItem) => {
      const rawItem = rawRetrievalResults.find((r) => r.id === apiItem._id);
      return {
        ...apiItem,
        score: rawItem?.score
      };
    });
  }, [retrievalResultsList, rawRetrievalResults]) as AssistantDatasetCiteItemWithScore[];

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
          {data?.runningTime || 0}s
        </Box>
      </Flex>

      {isOpen && (
        <Box ml={2} pl={4} pt={2} pb={0} borderLeft={'1px dashed'} borderColor={'myGray.250'}>
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

                // 从 score 数组中提取 fullText 和 embedding 分数
                if (item.score && Array.isArray(item.score)) {
                  item.score.forEach((scoreItem) => {
                    if (scoreItem.type === 'fullText') {
                      descriptionList.push(`全文检索：${scoreItem.value.toFixed(4)}`);
                    } else if (scoreItem.type === 'embedding') {
                      descriptionList.push(`向量检索：${scoreItem.value.toFixed(4)}`);
                    }
                  });
                }

                // 根据 sourceType 获取标题文本
                const title = t(SOURCE_TYPE_TEXT[item.sourceType] || t('chat:source_type_chunk'));

                return (
                  <ChunkInfoCard
                    key={item._id || index}
                    title={title}
                    descriptionList={descriptionList}
                    linkText={`#${index + 1}`}
                    linkUrl=""
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
        </Box>
      )}
    </Box>
  );
};

// 知识重排节点
const KnowledgeRerankNode = ({
  data,
  quoteList,
  rawQuoteList
}: {
  data?: ChatHistoryItemResType;
  quoteList?: AssistantDatasetCiteItemType[];
  rawQuoteList?: SearchDataResponseItemType[];
}) => {
  const { t } = useTranslation();
  const { isOpen, onToggle } = useDisclosure({ defaultIsOpen: false });

  // 合并数据：将 API 返回的完整数据与原始的 quoteList 合并，以获取 score 信息
  const mergedList = useMemo(() => {
    if (!quoteList || quoteList.length === 0) return [];
    if (!rawQuoteList || rawQuoteList.length === 0) return quoteList;

    return quoteList.map((apiItem) => {
      const rawItem = rawQuoteList.find((r) => r.id === apiItem._id);
      return {
        ...apiItem,
        score: rawItem?.score
      };
    });
  }, [quoteList, rawQuoteList]) as AssistantDatasetCiteItemWithScore[];

  // 当 mergedList 为空时，隐藏知识重排节点
  const shouldShow = mergedList.length > 0;

  if (!shouldShow) return null;

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
          {data?.runningTime || 0}s
        </Box>
      </Flex>

      {isOpen && (
        <Box ml={2} pl={4} pt={2} pb={0} borderLeft={'1px dashed'} borderColor={'myGray.250'}>
          {mergedList.length > 0 ? (
            <Flex flexDirection={'column'} gap={3}>
              {mergedList.map((item, index) => {
                // 构造描述列表 - 显示综合分数、重排分数和召回排名
                const descriptionList = [];

                // 从 score 数组中提取分数信息
                if (item.score && Array.isArray(item.score)) {
                  item.score.forEach((scoreItem) => {
                    if (scoreItem.type === 'rrf') {
                      descriptionList.push(`综合分数：${scoreItem.value.toFixed(4)}`);
                    } else if (scoreItem.type === 'reRank') {
                      descriptionList.push(`重排分数：${scoreItem.value.toFixed(4)}`);
                    }
                  });
                }

                // 添加召回排名（使用 index 字段）
                if (item.index !== undefined) {
                  descriptionList.push(`召回排名：#${item.index + 1}`);
                }

                // 根据 sourceType 获取标题文本
                const title = t(SOURCE_TYPE_TEXT[item.sourceType] || t('chat:source_type_chunk'));

                return (
                  <ChunkInfoCard
                    key={item._id || index}
                    title={title}
                    descriptionList={descriptionList}
                    linkText={`#${index + 1}`}
                    linkUrl=""
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
    // 如果是兜底回复，使用 answerNode 的 textOutput
    if (isFallback) {
      return data?.textOutput || '';
    }

    // 否则从 chatNode 的 historyPreview 中获取最后一个 AI 对话的 value
    if (chatNodeData?.historyPreview && Array.isArray(chatNodeData.historyPreview)) {
      const aiMessages = chatNodeData.historyPreview.filter((msg: any) => msg.obj === 'AI');
      if (aiMessages.length > 0) {
        return aiMessages[aiMessages.length - 1].value;
      }
    }

    // 兜底：使用 answerNode 的 textOutput
    return data?.textOutput || '';
  }, [data, isFallback, chatNodeData]);

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
            {finalAnswer && (
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
  chatTime = new Date(),
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

  // 从 retrievalResults 提取 datasetDataIdList（用于知识召回）
  const retrievalDatasetDataIdList = useMemo(
    () =>
      retrievalResults
        .map((item) => item.id)
        .filter((v) => v && !isDatabaseSource(v) && !isCorrectionRecord(v)),
    [retrievalResults]
  );

  // 从 retrievalResults 提取 collectionIdList（用于知识召回）
  const retrievalCollectionIdList = useMemo(
    () =>
      [...new Set(retrievalResults.map((item) => item.collectionId))].filter(
        (v) => v && !isDatabaseSource(v) && !isCorrectionRecord(v)
      ),
    [retrievalResults]
  );

  // 从 quoteList 提取 datasetDataIdList（用于知识重排）
  const quoteDatasetDataIdList = useMemo(
    () =>
      quoteList
        .map((item) => item.id)
        .filter((v) => v && !isDatabaseSource(v) && !isCorrectionRecord(v)),
    [quoteList]
  );

  // 从 quoteList 提取 collectionIdList（用于知识重排）
  const quoteCollectionIdList = useMemo(
    () =>
      [...new Set(quoteList.map((item) => item.collectionId))].filter(
        (v) => v && !isDatabaseSource(v) && !isCorrectionRecord(v)
      ),
    [quoteList]
  );

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
    return nodesAfterDatasetSearch.reduce((total, node) => {
      return total + (node.runningTime || 0);
    }, 0);
  }, [workflowNodes]);

  // 通过 API 获取知识召回的完整数据（包含 q、a 等字段）
  const { data: retrievalResultsList = [] } = useRequest2(
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
      refreshDeps: [retrievalResults, chatItemDataId],
      manual: false
    }
  ) as { data: AssistantDatasetCiteItemType[] };

  // 通过 API 获取知识重排的完整数据（包含 q、a 等字段）
  const { data: rerankQuoteList = [] } = useRequest2(
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
      refreshDeps: [quoteList, chatItemDataId],
      manual: false
    }
  ) as { data: AssistantDatasetCiteItemType[] };

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
                retrievalResultsList={retrievalResultsList}
                rawRetrievalResults={retrievalResults}
              />
              <KnowledgeRerankNode
                data={workflowNodes.find(
                  (node) => node.moduleType === FlowNodeTypeEnum.datasetSearchNode
                )}
                quoteList={rerankQuoteList}
                rawQuoteList={quoteList}
              />
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
