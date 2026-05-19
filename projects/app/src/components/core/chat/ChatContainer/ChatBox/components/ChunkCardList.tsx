import React, { useMemo, useState, useRef } from 'react';
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

const ChunkCardList = React.memo(function QuoteList({
  chatItemDataId = '',
  rawSearch = [],
  applicationId,
  chatId,
  isAgenticMode = false
}: {
  chatItemDataId?: string;
  rawSearch: SearchDataResponseItemType[];
  applicationId?: string;
  chatId?: string;
  isAgenticMode?: boolean;
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
        .filter((v) => v && !isDatabaseSource(v) && !isCorrectionRecord(v)),
    [rawSearch]
  );
  const collectionIdList = useMemo(
    () =>
      [...new Set(rawSearch.map((item) => item.collectionId))].filter(
        (v) => !isDatabaseSource(v) && !isCorrectionRecord(v) && v
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
  }, [rawSearch, quoteList, chatItemDataId, t, isAgenticMode]);

  const maxCount = 10;
  const [isShowAll, toggleStatus] = useState(formatedDataList.length <= maxCount);
  const listRef = useRef<HTMLDivElement>(null);

  return (
    <Box ref={listRef}>
      {formatedDataList.map((item, i) => (
        <Box
          key={item.id || `${item.collectionId || 'collection'}-${item.chunkIndex || i}`}
          mb={1}
          display={isShowAll || i < maxCount ? undefined : 'none'}
        >
          <ChunkInfoCard {...item} />
        </Box>
      ))}
      {!isShowAll && (
        <Button
          onClick={() => {
            const scrollContainer = findScrollableAncestor(listRef.current);
            const savedScrollTop = scrollContainer?.scrollTop;

            toggleStatus(true);

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
          {t('chat:view_all_knowledge', { count: formatedDataList.length })}
        </Button>
      )}
    </Box>
  );
});

export default ChunkCardList;
