import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Box, Flex, Button } from '@chakra-ui/react';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import type { SearchDataResponseItemType, AssistantDatasetCiteItemType } from '@fastgpt/global/core/dataset/type';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { getAssistantRetrievalResults, getAssistantQuoteList } from '@/web/core/chat/api';
import { isDatabaseSource } from '@fastgpt/global/core/dataset/utils';
import { isCorrectionRecord } from '@/global/core/chat/utils';
import ChunkInfoCard from './ChunkInfoCard';
import FaqContentCard from './FaqContentCard';
import { useContextSelector } from 'use-context-selector';
import { WorkflowRuntimeContext } from '../ChatContainer/context/workflowRuntimeContext';
import { useChatStore } from '@/web/core/chat/context/useChatStore';

type AssistantDatasetCiteItemWithScore = AssistantDatasetCiteItemType & {
  score?: SearchDataResponseItemType['score'];
  datasetId?: string;
  collectionId?: string;
  sourceName?: string;
  index?: number;
  retrievalRank?: number;
};

type RowProps = {
  label: string;
  value?: string | number | boolean | object;
  rawDom?: React.ReactNode;
};

type Props = {
  activeModule: ChatHistoryItemResType;
  dataId?: string;
  chatId?: string;
  appId?: string;
  Row: (props: RowProps) => React.ReactNode;
  quoteListDom: React.ReactNode;
};

const findScrollableAncestor = (el: HTMLElement | null): HTMLElement | null => {
  if (!el) return null;
  let current: HTMLElement | null = el;
  while (current) {
    const style = window.getComputedStyle(current);
    const overflowY = style.overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
      if (current.scrollHeight > current.clientHeight) {
        return current;
      }
    }
    current = current.parentElement;
  }
  return null;
};

const DatasetSearchRetrievalResults = ({
  activeModule,
  dataId,
  chatId: chatIdProp,
  appId: appIdProp,
  Row,
  quoteListDom
}: Props) => {
  const { t } = useSafeTranslation();

  // 与 ChunkCardList 保持一致，从 context/store 获取兜底值
  const { appId: storeAppId, outLinkAuthData } = useChatStore();
  const contextChatId = useContextSelector(WorkflowRuntimeContext, (v) => v.chatId);
  const contextAppId = useContextSelector(WorkflowRuntimeContext, (v) => v.appId);
  const appId = appIdProp || contextAppId || storeAppId;
  const chatId = chatIdProp || contextChatId;

  const SOURCE_TYPE_TEXT = useMemo(
    () => ({
      faq: t('chat:source_type_faq'),
      sql: t('chat:source_type_sql'),
      correction: t('chat:source_type_correction'),
      chunk: t('chat:source_type_chunk')
    }),
    [t]
  );

  const retrievalRawResults = useMemo(
    () => activeModule.retrievalResults || [],
    [activeModule.retrievalResults]
  );

  const hasRetrievalResults = retrievalRawResults.length > 0;

  const { retrievalDatasetDataIdList, retrievalCollectionIdList } = useMemo(() => {
    const datasetDataIdList = retrievalRawResults
      .map((item) => item.id)
      .filter((v): v is string => !!v);
    const collectionIdList = [
      ...new Set(retrievalRawResults.map((item) => item.collectionId).filter((v): v is string => !!v))
    ];
    return { retrievalDatasetDataIdList: datasetDataIdList, retrievalCollectionIdList: collectionIdList };
  }, [retrievalRawResults]);

  const { data: retrievalResultsDetail = [] } = useRequest(
    async () =>
      !!dataId && !!chatId && !!appId && retrievalDatasetDataIdList.length > 0
        ? await getAssistantRetrievalResults({
            datasetDataIdList: retrievalDatasetDataIdList,
            collectionIdList: retrievalCollectionIdList,
            chatId,
            chatItemDataId: dataId,
            appId,
            ...outLinkAuthData
          })
        : [],
    {
      refreshDeps: [retrievalDatasetDataIdList.length, dataId, chatId, appId],
      manual: false
    }
  ) as { data: AssistantDatasetCiteItemType[] };

  const retrievalMergedList = useMemo((): AssistantDatasetCiteItemWithScore[] => {
    if (!retrievalRawResults.length || !retrievalResultsDetail.length) return [];
    return retrievalRawResults
      .map((rawItem) => {
        const apiItem = retrievalResultsDetail.find((r) => r._id === rawItem.id);
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
  }, [retrievalRawResults, retrievalResultsDetail]);

  const quoteRawList = useMemo(
    () => (hasRetrievalResults ? activeModule.quoteList || [] : []),
    [hasRetrievalResults, activeModule.quoteList]
  );

  const { quoteDatasetDataIdList, quoteCollectionIdList } = useMemo(() => {
    const datasetDataIdList = quoteRawList
      .map((item) => item.id)
      .filter((v): v is string => !!v && !isDatabaseSource(v) && !isCorrectionRecord(v));
    const collectionIdList = [
      ...new Set(
        quoteRawList
          .map((item) => item.collectionId)
          .filter((v): v is string => !!v && !isDatabaseSource(v) && !isCorrectionRecord(v))
      )
    ];
    return { quoteDatasetDataIdList: datasetDataIdList, quoteCollectionIdList: collectionIdList };
  }, [quoteRawList]);

  const { data: quoteListDetail = [] } = useRequest(
    async () =>
      !!dataId && !!chatId && !!appId && hasRetrievalResults && quoteDatasetDataIdList.length > 0
        ? await getAssistantQuoteList({
            datasetDataIdList: quoteDatasetDataIdList,
            collectionIdList: quoteCollectionIdList,
            chatId,
            chatItemDataId: dataId,
            appId,
            ...outLinkAuthData
          })
        : [],
    {
      refreshDeps: [quoteDatasetDataIdList.length, dataId, chatId, appId, hasRetrievalResults],
      manual: false
    }
  ) as { data: AssistantDatasetCiteItemType[] };

  const rerankMergedList = useMemo((): AssistantDatasetCiteItemWithScore[] => {
    if (!quoteRawList.length || !quoteListDetail.length) return [];
    return quoteRawList
      .map((rawItem) => {
        const apiItem = quoteListDetail.find((r) => r._id === rawItem.id);
        if (!apiItem) return null;
        return {
          ...apiItem,
          datasetId: rawItem.datasetId,
          collectionId: rawItem.collectionId,
          sourceName: rawItem.sourceName,
          index: rawItem.chunkIndex,
          score: rawItem.score,
          retrievalRank: rawItem.retrievalRank
        };
      })
      .filter(Boolean) as AssistantDatasetCiteItemWithScore[];
  }, [quoteRawList, quoteListDetail]);

  const maxCount = 10;
  const [isShowAllRecall, setIsShowAllRecall] = useState(true);
  const [isShowAllRerank, setIsShowAllRerank] = useState(true);
  const recallListRef = useRef<HTMLDivElement>(null);
  const rerankListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsShowAllRecall(retrievalMergedList.length <= maxCount);
  }, [retrievalMergedList.length]);

  useEffect(() => {
    setIsShowAllRerank(rerankMergedList.length <= maxCount);
  }, [rerankMergedList.length]);

  const recallListDom = useMemo(() => {
    if (!hasRetrievalResults || retrievalMergedList.length === 0) return null;
    const shouldUseFaqCard =
      activeModule.retrievalType === 'correction' || activeModule.retrievalType === 'faq';
    return (
      <Box ref={recallListRef}>
        <Flex flexDirection={'column'} gap={3}>
          {retrievalMergedList.map((item, index) => {
            if (shouldUseFaqCard) {
              return (
                <Box
                  key={item._id || `${item.collectionId || 'collection'}-${item.index || index}`}
                  display={isShowAllRecall || index < maxCount ? undefined : 'none'}
                >
                  <FaqContentCard
                    q={item.q}
                    a={item.a || ''}
                    retrievalType={activeModule.retrievalType}
                  />
                </Box>
              );
            }
            const descriptionList: string[] = [];
            if (item.score && Array.isArray(item.score)) {
              const fullTextScore = item.score.find((s) => s.type === 'fullText');
              const embeddingScore = item.score.find((s) => s.type === 'embedding');
              if (fullTextScore)
                descriptionList.push(`${t('chat:fulltext_search')}${fullTextScore.value.toFixed(4)}`);
              if (embeddingScore)
                descriptionList.push(`${t('chat:vector_search')}${embeddingScore.value.toFixed(4)}`);
            }
            const title = `${t('chat:recall_card_prefix')}${SOURCE_TYPE_TEXT[item.sourceType] || t('chat:source_type_chunk')}`;
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
              <Box
                key={item._id || `${item.collectionId || 'collection'}-${item.index || index}`}
                display={isShowAllRecall || index < maxCount ? undefined : 'none'}
              >
                <ChunkInfoCard
                  title={title}
                  descriptionList={descriptionList}
                  linkText={linkText}
                  linkUrl={linkUrl}
                  q={item.q}
                  a={item.a}
                />
              </Box>
            );
          })}
        </Flex>
        {!isShowAllRecall && (
          <Button
            mt={3}
            onClick={() => {
              const scrollContainer = findScrollableAncestor(recallListRef.current);
              const savedScrollTop = scrollContainer?.scrollTop;
              setIsShowAllRecall(true);
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  setTimeout(() => {
                    if (scrollContainer && savedScrollTop !== undefined) {
                      scrollContainer.scrollTop = savedScrollTop;
                    }
                  }, 0);
                });
              });
            }}
            w="100%"
            variant={'primaryOutline'}
          >
            {t('chat:view_all_knowledge', { count: retrievalMergedList.length })}
          </Button>
        )}
      </Box>
    );
  }, [hasRetrievalResults, retrievalMergedList, activeModule.retrievalType, SOURCE_TYPE_TEXT, t, isShowAllRecall]);

  const rerankListDom = useMemo(() => {
    if (!hasRetrievalResults || rerankMergedList.length === 0) return null;
    return (
      <Box ref={rerankListRef}>
        <Flex flexDirection={'column'} gap={3}>
          {rerankMergedList.map((item, index) => {
            const descriptionList: string[] = [];
            if (item.score && Array.isArray(item.score)) {
              const rrfScore = item.score.find((s) => s.type === 'rrf');
              const reRankScore = item.score.find((s) => s.type === 'reRank');
              if (rrfScore)
                descriptionList.push(`${t('chat:combined_score')}${rrfScore.value.toFixed(4)}`);
              if (reRankScore)
                descriptionList.push(`${t('chat:rerank_score')}${reRankScore.value.toFixed(4)}`);
            }
            let recallRank = '-';
            if (item.retrievalRank !== undefined) recallRank = `${item.retrievalRank + 1}`;
            descriptionList.push(`${t('chat:recall_rank')}${recallRank}`);
            const title = `${t('chat:rerank_card_prefix')}TOP${index + 1}`;
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
              <Box
                key={item._id || `${item.collectionId || 'collection'}-${item.index || index}`}
                display={isShowAllRerank || index < maxCount ? undefined : 'none'}
              >
                <ChunkInfoCard
                  title={title}
                  descriptionList={descriptionList}
                  linkText={linkText}
                  linkUrl={linkUrl}
                  q={item.q}
                  a={item.a}
                />
              </Box>
            );
          })}
        </Flex>
        {!isShowAllRerank && (
          <Button
            mt={3}
            onClick={() => {
              const scrollContainer = findScrollableAncestor(rerankListRef.current);
              const savedScrollTop = scrollContainer?.scrollTop;
              setIsShowAllRerank(true);
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  setTimeout(() => {
                    if (scrollContainer && savedScrollTop !== undefined) {
                      scrollContainer.scrollTop = savedScrollTop;
                    }
                  }, 0);
                });
              });
            }}
            w="100%"
            variant={'primaryOutline'}
          >
            {t('chat:view_all_knowledge', { count: rerankMergedList.length })}
          </Button>
        )}
      </Box>
    );
  }, [hasRetrievalResults, rerankMergedList, t, isShowAllRerank]);

  if (!hasRetrievalResults) {
    return <>{quoteListDom}</>;
  }

  return (
    <>
      {recallListDom && <Row label={t('chat:knowledge_recall')} rawDom={recallListDom} />}
      {!activeModule.quoteList || activeModule.quoteList.length === 0 ? (
        <Row label={t('chat:knowledge_rerank')} value={t('chat:no_matching_knowledge')} />
      ) : rerankListDom ? (
        <Row label={t('chat:knowledge_rerank')} rawDom={rerankListDom} />
      ) : null}
    </>
  );
};

export default DatasetSearchRetrievalResults;
