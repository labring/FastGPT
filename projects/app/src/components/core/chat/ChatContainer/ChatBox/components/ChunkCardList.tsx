import React, { useMemo, useState } from 'react';
import { Box, useTheme, Button } from '@chakra-ui/react';

import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import QuoteItem, { formatScore } from '@/components/core/dataset/QuoteItem';
import { useContextSelector } from 'use-context-selector';
import { WorkflowRuntimeContext } from '../../context/workflowRuntimeContext';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { getQuoteDataList } from '@/web/core/chat/record/api';
import type { GetQuoteResponseType } from '@fastgpt/global/openapi/core/chat/record/api';
import { isDatabaseSource } from '@fastgpt/global/core/dataset/utils';
import { isCorrectionRecord } from '@/global/core/chat/utils';
import { useTranslation } from 'next-i18next';
import ChunkInfoCard from '@/components/core/chat/components/ChunkInfoCard';

const ChunkCardList = React.memo(function QuoteList({
  chatItemDataId = '',
  rawSearch = [],
  applicationId,
  chatId
}: {
  chatItemDataId?: string;
  rawSearch: SearchDataResponseItemType[];
  applicationId?: string;
  chatId?: string;
}) {
  const theme = useTheme();
  const { appId, outLinkAuthData } = useChatStore();

  const RawSourceBoxProps = useContextSelector(WorkflowRuntimeContext, (v) => ({
    chatItemDataId,
    appId: v.appId,
    chatId: chatId || v.chatId, // 优先使用外部传入的chatId
    ...(v.outLinkAuthData || {})
  }));

  const datasetDataIdList = useMemo(
    () =>
      rawSearch
        .map((item) => item.id)
        .filter((v) => !isDatabaseSource(v) && !isCorrectionRecord(v)),
    [rawSearch]
  );
  const collectionIdList = useMemo(
    () =>
      [...new Set(rawSearch.map((item) => item.collectionId))].filter(
        (v) => !isDatabaseSource(v) && !isCorrectionRecord(v)
      ),
    [rawSearch]
  );

  const { data: quoteList } = useRequest(
    async (): Promise<GetQuoteResponseType> =>
      !!chatItemDataId
        ? await getQuoteDataList({
            datasetDataIdList,
            collectionIdList,
            chatItemDataId,
            appId: applicationId || appId,
            chatId: RawSourceBoxProps.chatId,
            ...outLinkAuthData
          })
        : [],
    {
      refreshDeps: [rawSearch, RawSourceBoxProps.chatId],
      manual: false
    }
  );

  const { t } = useTranslation();

  const formatedDataList = useMemo(() => {
    const processedData = rawSearch.map((item) => {
      if (chatItemDataId && quoteList) {
        const currentFilterItem = quoteList.find((res) => res._id === item.id);

        return {
          ...item,
          q: currentFilterItem?.q || '',
          a: currentFilterItem?.a || '',
          imagePreivewUrl: currentFilterItem?.imagePreivewUrl
        };
      }

      return { ...item, q: item.q || '' };
    });

    return processedData
      .sort((a, b) => {
        const aScore = formatScore(a.score);
        const bScore = formatScore(b.score);
        return (bScore.primaryScore?.value || 0) - (aScore.primaryScore?.value || 0);
      })
      .map((item, index) => {
        // 构造描述列表 - 显示综合分数、重排分数和召回排名，按固定顺序显示
        const descriptionList = [];

        // 从 score 数组中提取分数信息，按固定顺序添加
        if (item.score && Array.isArray(item.score)) {
          const rrfScore = item.score.find((s) => s.type === 'rrf');
          const reRankScore = item.score.find((s) => s.type === 'reRank');

          if (rrfScore) {
            descriptionList.push(`${t('chat:combined_score')}${rrfScore.value.toFixed(4)}`);
          }
          if (reRankScore) {
            descriptionList.push(`${t('chat:rerank_score')}${reRankScore.value.toFixed(4)}`);
          }
        }

        // 计算召回排名：从 rawQuoteList 中的 retrievalRank 字段获取（从 0 开始，显示时 +1）
        let recallRank = '-';
        if (item.retrievalRank !== undefined) {
          recallRank = `${item.retrievalRank + 1}`;
        }
        descriptionList.push(`${t('chat:recall_rank')}${recallRank}`);

        // 使用 TOP1、TOP2 格式作为标题
        const title = `TOP${index + 1}`;

        // 计算 linkText 和 linkUrl
        let linkText = '';
        let linkUrl = '';

        if (!isDatabaseSource(item.id)) {
          linkText = `${item.sourceName || ''} / #${item.chunkIndex}`;
          linkUrl = `/dataset/detail?datasetId=${item.datasetId || ''}&collectionId=${item.collectionId || ''}&currentTab=dataCard&activeId=${item.id || ''}`;
        } else {
          linkText = item.sourceName || '';
          linkUrl = `/dataset/detail?datasetId=${item.datasetId || ''}`;
        }

        return {
          ...item,
          imagePreviewUrl: item.imagePreivewUrl,
          descriptionList,
          linkText,
          linkUrl,
          title
        };
      });
  }, [rawSearch, quoteList, chatItemDataId, t]);

  const maxCount = 5;
  const [isShowAll, toggleStatus] = useState(formatedDataList.length <= maxCount);
  const displayList = useMemo(
    () => (isShowAll ? formatedDataList : formatedDataList.slice(0, maxCount)),
    [isShowAll, formatedDataList]
  );

  return (
    <>
      {displayList.map((item, i) => (
        <Box key={i} mb={1}>
          <ChunkInfoCard {...item} />
        </Box>
      ))}
      {!isShowAll && (
        <Button onClick={() => toggleStatus(!isShowAll)} w="100%" variant={'primaryOutline'}>
          {t('chat:view_all_knowledge', { count: formatedDataList.length })}
        </Button>
      )}
    </>
  );
});

export default ChunkCardList;
